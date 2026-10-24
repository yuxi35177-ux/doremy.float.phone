package app.floatphone.shell

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.Assert.assertTrue
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class LocalBundleTest {
    private fun web(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) web(view.getChildAt(index))?.let { return it }
        return null
    }
    private fun js(scenario: ActivityScenario<MainActivity>, source: String): String {
        val latch = CountDownLatch(1)
        var value = "null"
        scenario.onActivity { activity -> web(activity.window.decorView)!!.evaluateJavascript(source) { value = it; latch.countDown() } }
        check(latch.await(15, TimeUnit.SECONDS)) { "WebView did not respond" }
        return value
    }
    private fun until(scenario: ActivityScenario<MainActivity>, source: String) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(120)
        while (System.nanoTime() < deadline) {
            if (js(scenario, source) == "true") return
            Thread.sleep(400)
        }
        throw AssertionError("Local UI failed: " + js(scenario,"document.body?.innerText?.slice(0,500)"))
    }
    @Test fun opensSettingsAndPerceptionWithoutWebsite() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            until(scenario, "!!window.__PHONE_LOCAL__ && !!document.querySelector('.splash-enter-button:not(:disabled)')")
            js(scenario, "document.querySelector('.splash-enter-button').click()")
            until(scenario, "!!document.querySelector('[data-flip-id=\"icon:settings\"]')")
            js(scenario, "document.querySelector('[data-flip-id=\"icon:settings\"]').click()")
            until(scenario, "!!document.querySelector('.settings-main-menu .card-label')")
            assertTrue(js(scenario, "Array.from(document.querySelectorAll('.settings-main-menu .card-card')).every(e=>e.getBoundingClientRect().right<=document.querySelector('.settings-main-menu').getBoundingClientRect().right+2)") == "true")
            assertTrue(js(scenario, "parseFloat(getComputedStyle(document.querySelector('.settings-main-menu .card-label')).fontSize)<=14") == "true")
            js(scenario, "Array.from(document.querySelectorAll('.settings-main-menu .card-label')).find(e=>e.textContent==='感知').closest('button').click()")
            until(scenario, "!!document.querySelector('.per-shell')")
            assertTrue(js(scenario, "['电量与充电','网络状态','前台应用','步数','位置','睡眠','系统日历','联系人','使用统计','回到手机提醒','作息与习惯','采样间隔'].every(s=>document.body.innerText.includes(s))") == "true")
            until(scenario, "!!document.querySelector('[aria-label=\"现实功能逐项测试\"]')")
            js(scenario, "document.querySelector('[aria-label=\"现实功能逐项测试\"] button').click()")
            until(scenario, "!!document.querySelector('[aria-label=\"现实功能逐项测试\"] [role=status]')")
            assertTrue(js(scenario, "document.querySelector('[aria-label=\"现实功能逐项测试\"] [role=status]').textContent.includes('percent')") == "true")
            assertTrue(js(scenario, "typeof AndroidShell.getPerceptionSnapshot==='function' && typeof AndroidShell.getRealtimeSnapshot==='function'") == "true")
            js(scenario, "document.querySelector('[data-flip-id=\"icon:square_forum\"]').click()")
            until(scenario, "!!document.querySelector('[data-testid=square-forum-frame]')?.contentDocument?.querySelector('#forum-screen.is-open')")
            js(scenario, "document.querySelector('[data-testid=square-forum-frame]').contentDocument.querySelector('#forum-sector-settings-btn').click()")
            until(scenario, "!!document.querySelector('[data-testid=square-forum-frame]').contentDocument.querySelector('#forum-generate-count')")
            assertTrue(js(scenario, "document.querySelector('[data-testid=square-forum-frame]').contentDocument.body.innerText.includes('可删除、加精华的身份组')") == "true")
            js(scenario, "window.dispatchEvent(new Event('float-navigation-back',{cancelable:true}))")
            assertTrue(js(scenario, "!!document.querySelector('[data-testid=square-forum-frame]')") == "true")
        }
    }
}

// Keep compiled packages available if cloud device verification is interrupted.
