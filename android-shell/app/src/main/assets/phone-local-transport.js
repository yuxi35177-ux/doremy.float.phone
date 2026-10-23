(() => {
  if (window.__PHONE_LOCAL__) return;
  window.__PHONE_LOCAL__ = true;
  const originalFetch = window.fetch.bind(window);
  const bridge = window.FloatLocalHttp;
  if (!bridge) throw new Error('本地请求桥不可用，请更新 Android System WebView');
  const pending = new Map();
  const base64 = bytes => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  };
  bridge.onmessage = event => {
    try { const reply = JSON.parse(event.data); pending.get(reply.id)?.(reply); } catch (_) {}
  };
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== location.origin) return originalFetch(request);
    const id = crypto.randomUUID();
    const body = ['GET','HEAD'].includes(request.method) ? null : base64(new Uint8Array(await request.arrayBuffer()));
    return new Promise((resolve, reject) => {
      let control, donePull, settled = false;
      const send = (type, extra = {}) => bridge.postMessage(JSON.stringify({id, type, ...extra}));
      const cleanup = () => { clearTimeout(timer); pending.delete(id); request.signal.removeEventListener('abort', abort); donePull?.(); };
      const fail = error => { cleanup(); send('cancel'); if (settled) control?.error(error); else reject(error); };
      const abort = () => fail(new DOMException('Aborted','AbortError'));
      const timer = setTimeout(() => fail(new Error('本地接口响应超时')), 120000);
      if (request.signal.aborted) { abort(); return; }
      request.signal.addEventListener('abort', abort, {once:true});
      pending.set(id, reply => {
        if (reply.type === 'error') { fail(new Error('本地接口请求失败')); return; }
        if (reply.type === 'headers') {
          settled = true;
          const stream = request.method === 'HEAD' || [204,205,304].includes(reply.status) ? null : new ReadableStream({
            start(c) { control = c; },
            pull() { return new Promise(done => { donePull = done; send('pull'); }); },
            cancel() { cleanup(); send('cancel'); }
          });
          const response = new Response(stream, {status:reply.status, headers:reply.headers || {'content-type':reply.contentType}});
          Object.defineProperty(response, 'url', {value:request.url});
          resolve(response);
          if (!stream) { cleanup(); send('cancel'); }
        } else if (reply.type === 'chunk') {
          control.enqueue(Uint8Array.from(atob(reply.data), c => c.charCodeAt(0)));
          const done = donePull; donePull = null; done?.();
        } else if (reply.type === 'end') { cleanup(); control?.close(); }
      });
      send('start', {url:request.url, method:request.method, headers:Object.fromEntries(request.headers), body, bodyBase64:true});
    });
  };
  // An older online service worker must not serve old bundles over this APK.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(async registrations => {
      const hadController = !!navigator.serviceWorker.controller;
      await Promise.all(registrations.map(registration => registration.unregister()));
      if (hadController && !sessionStorage.getItem('phone-local-sw-reset')) {
        sessionStorage.setItem('phone-local-sw-reset','1'); location.reload();
      }
    });
  }
})();
