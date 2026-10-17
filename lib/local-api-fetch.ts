/** Phone-local APIs must never be forwarded to the deployment server. */
type LocalBridge = {
    postMessage(message: string): void;
    onmessage: ((event: { data: string }) => void) | null;
};
type LocalWindow = Window & {
    FloatLocalApi?: LocalBridge;
    AndroidShell?: unknown;
};
type Reply = { id: string; type: string; status?: number; contentType?: string; data?: string };
const LOCAL_API_ERROR = "当前 APK 尚不支持手机本地 HTTP 接口，请更新支持本地 API 的 APK；仅更新网站无法解除旧壳的网络限制。";

export function isLoopbackApiUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") &&
            ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname.toLowerCase());
    } catch { return false; }
}

// One multiplexed listener; each request owns its stream and cancellation signal.
const listeners = new Map<string, (reply: Reply) => void>();
let installedBridge: LocalBridge | undefined;
function install(bridge: LocalBridge) {
    if (installedBridge === bridge) return;
    installedBridge = bridge;
    bridge.onmessage = event => {
        try {
            const reply: Reply = JSON.parse(event.data);
            listeners.get(reply.id)?.(reply);
        } catch { /* Ignore malformed messages without logging credentials. */ }
    };
}

export async function localApiFetch(url: string, init: RequestInit = {}): Promise<Response> {
    if (!isLoopbackApiUrl(url) || typeof window === "undefined") return fetch(url, init);
    const host = window as LocalWindow;
    const bridge = host.FloatLocalApi;
    if (!bridge) {
        if (host.AndroidShell) throw new Error(LOCAL_API_ERROR);
        try { return await fetch(url, { ...init, credentials: "omit" }); }
        catch (error) {
            if (init.signal?.aborted) throw error;
            throw new Error("无法连接手机本地 API：请确认本机服务已启动，并允许网站跨域访问及浏览器的本地网络权限。可尝试支持本地 API 的新版 APK。");
        }
    }
    install(bridge);
    const signal = init.signal;
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (init.body != null && typeof init.body !== "string") throw new Error("本地 API 仅支持 JSON 文本请求");
    const id = crypto.randomUUID();
    const send = (type: string, extra = {}) => bridge.postMessage(JSON.stringify({ type, id, ...extra }));
    return new Promise<Response>((resolve, reject) => {
        let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
        let settled = false;
        let finishPull: (() => void) | undefined;
        let timer: ReturnType<typeof setTimeout>;
        const cleanup = () => {
            clearTimeout(timer);
            finishPull?.();
            listeners.delete(id);
            signal?.removeEventListener("abort", abort);
        };
        const fail = (error: unknown) => {
            cleanup();
            try { send("cancel"); } catch { /* Native side has its own timeout. */ }
            if (settled) controller?.error(error);
            else reject(error);
        };
        const abort = () => fail(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        listeners.set(id, reply => {
            if (reply.type === "error") {
                fail(new Error("手机本地 API 连接失败或超时，请确认服务仍在运行，地址、端口及 API 路径正确。"));
            } else if (reply.type === "headers" && !settled) {
                clearTimeout(timer);
                const status = reply.status ?? 500;
                const noBody = [204, 205, 304].includes(status);
                const stream = noBody ? null : new ReadableStream<Uint8Array>({
                    start(c) { controller = c; },
                    // ReadableStream calls pull only when capacity is available.
                    pull() {
                        return new Promise<void>(done => { finishPull = done; send("pull"); });
                    },
                    cancel() { cleanup(); send("cancel"); },
                });
                settled = true;
                resolve(new Response(stream, {
                    status,
                    headers: { "Content-Type": reply.contentType || "application/json" },
                }));
                if (noBody) { cleanup(); send("cancel"); }
            } else if (reply.type === "chunk" && controller) {
                const bytes = Uint8Array.from(atob(reply.data || ""), c => c.charCodeAt(0));
                controller.enqueue(bytes);
                const done = finishPull; finishPull = undefined; done?.();
            } else if (reply.type === "end") {
                cleanup();
                controller?.close();
            }
        });
        timer = setTimeout(() => fail(new Error("手机本地 API 响应超时，请检查本机服务")), 35_000);
        signal?.addEventListener("abort", abort, { once: true });
        try {
            send("start", {
                url, method: init.method || "GET",
                headers: Object.fromEntries(new Headers(init.headers).entries()),
                body: init.body ?? null,
            });
        } catch (error) { fail(error); }
    });
}
