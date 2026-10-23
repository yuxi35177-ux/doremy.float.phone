package app.floatphone.shell

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.CookieManager
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.ByteArrayInputStream
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream
import kotlin.concurrent.thread

/** Bundled Next server; the old HTTPS origin is virtual, preserving WebView storage. */
object LocalRuntime {
    private val ready = CountDownLatch(1)
    private var started = false
    private var failure: Throwable? = null
    private val token = UUID.randomUUID().toString()
    private var port = 0
    private val client = OkHttpClient.Builder().followRedirects(false)
        .followSslRedirects(false).proxy(java.net.Proxy.NO_PROXY)
        .readTimeout(120, TimeUnit.SECONDS).build()
    private external fun startNode(directory: String, port: Int, token: String): Int

    @Synchronized fun start(context: Context) {
        if (started) return
        started = true
        val app = context.applicationContext
        thread(name = "phone-local-prepare") {
            try {
                check(BuildConfig.LOCAL_BUNDLE) { "Local bundle missing" }
                val root = File(app.noBackupFilesDir, "phone-runtime-${BuildConfig.VERSION_CODE}")
                if (!File(root, ".complete").exists()) {
                    root.deleteRecursively()
                    root.mkdirs()
                    ZipInputStream(app.assets.open("phone-server.zip")).use { zip ->
                        var entry = zip.nextEntry
                        var total = 0L
                        while (entry != null) {
                            val output = File(root, entry.name)
                            check(output.canonicalPath.startsWith(root.canonicalPath + File.separator))
                            if (entry.isDirectory) output.mkdirs() else {
                                output.parentFile?.mkdirs()
                                output.outputStream().use { target -> total += zip.copyTo(target) }
                                check(total <= 1500L * 1024 * 1024) { "Local bundle too large" }
                            }
                            zip.closeEntry()
                            entry = zip.nextEntry
                        }
                    }
                    File(root, ".complete").writeText(BuildConfig.VERSION_NAME)
                }
                // Only application runtime files are replaced. Never erase WebView/IndexedDB.
                app.noBackupFilesDir.listFiles()?.filter {
                    it.name.startsWith("phone-runtime-") && it != root
                }?.forEach { it.deleteRecursively() }
                port = ServerSocket(0, 0, java.net.InetAddress.getByName("127.0.0.1")).use { it.localPort }
                System.loadLibrary("node")
                System.loadLibrary("phone-local")
                thread(name = "phone-local-node") {
                    try {
                        val code = startNode(root.absolutePath, port, token)
                        failure = IllegalStateException("Local server exited ($code)")
                    } catch (error: Throwable) { failure = error }
                }
                val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(90)
                var healthy = false
                while (!healthy && failure == null && System.nanoTime() < deadline) {
                    healthy = runCatching {
                        client.newCall(newRequest("/phone-local-health").build()).execute().use { it.isSuccessful }
                    }.getOrDefault(false)
                    if (!healthy) Thread.sleep(200)
                }
                check(healthy) { "Local server did not start" }
            } catch (error: Throwable) { failure = error }
            finally { ready.countDown() }
        }
    }

    fun awaitReady() {
        check(ready.await(100, TimeUnit.SECONDS)) { "Local startup timed out" }
        failure?.let { throw IllegalStateException("Local server unavailable", it) }
    }

    fun owns(url: Uri): Boolean {
        val origin = Uri.parse(MainActivity.SITE_URL)
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
    }

    fun newRequest(path: String): Request.Builder = Request.Builder()
        .url("http://127.0.0.1:$port$path")
        .header("X-Phone-Local-Token", token)

    fun requestFor(url: Uri): Request.Builder {
        awaitReady()
        val path = (url.encodedPath?.ifEmpty { "/" } ?: "/") +
            (url.encodedQuery?.let { "?$it" } ?: "")
        return newRequest(path).header("Host", Uri.parse(MainActivity.SITE_URL).authority!!)
            .header("X-Forwarded-Proto", "https")
    }

    fun route(request: Request): Request {
        val uri = Uri.parse(request.url.toString())
        if (!BuildConfig.LOCAL_BUNDLE || !owns(uri)) return request
        val local = requestFor(uri).build()
        return request.newBuilder().url(local.url)
            .header("Host", Uri.parse(MainActivity.SITE_URL).authority!!)
            .header("X-Phone-Local-Token", token).header("X-Forwarded-Proto", "https").build()
    }

    fun intercept(request: WebResourceRequest): WebResourceResponse? {
        if (!BuildConfig.LOCAL_BUNDLE || !owns(request.url)) return null
        return try {
            val builder = requestFor(request.url)
            request.requestHeaders.forEach { (key, value) ->
                if (key.lowercase() !in setOf("host", "connection", "accept-encoding", "x-phone-local-token")) builder.header(key, value)
            }
            CookieManager.getInstance().getCookie(MainActivity.SITE_URL)?.let { builder.header("Cookie", it) }
            val result = client.newCall(builder.method(request.method, null).build()).execute()
            result.headers("Set-Cookie").forEach { CookieManager.getInstance().setCookie(MainActivity.SITE_URL, it) }
            val type = result.header("Content-Type") ?: "application/octet-stream"
            val headers = result.headers.toMultimap().mapValues { it.value.joinToString(", ") }.toMutableMap()
            headers.remove("content-encoding"); headers.remove("content-length")
            WebResourceResponse(type.substringBefore(';'), "UTF-8", result.code,
                result.message.ifEmpty { "OK" }, headers, result.body?.byteStream())
        } catch (_: Throwable) {
            WebResourceResponse("text/plain", "UTF-8", 503, "Local runtime unavailable", emptyMap(),
                ByteArrayInputStream("本地启动失败。请重开 App；不会回退到在线网页。".toByteArray()))
        }
    }
}
