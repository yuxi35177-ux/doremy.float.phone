(function () {
  if (window.__FLOAT_ENHANCER_LOADED__) return;
  window.__FLOAT_ENHANCER_LOADED__ = true;

  // ========== 1. 底层防卡顿：localStorage 内存高速缓存 + 异步批量落盘 ==========
  try {
    const rawGet = Storage.prototype.getItem;
    const rawSet = Storage.prototype.setItem;
    const rawRemove = Storage.prototype.removeItem;
    const rawClear = Storage.prototype.clear;

    const memCache = new Map();
    const pendingWrites = new Map();
    let flushTimer = null;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) {
        memCache.set(k, rawGet.call(localStorage, k));
      }
    }

    const flushNow = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingWrites.forEach((val, key) => {
        try {
          if (val === null) rawRemove.call(localStorage, key);
          else rawSet.call(localStorage, key, val);
        } catch (e) {}
      });
      pendingWrites.clear();
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(flushNow, { timeout: 1000 });
        } else {
          flushNow();
        }
      }, 600);
    };

    Storage.prototype.getItem = function (key) {
      if (this === localStorage) {
        const k = String(key);
        if (memCache.has(k)) return memCache.get(k);
        const val = rawGet.call(localStorage, k);
        memCache.set(k, val);
        return val;
      }
      return rawGet.call(this, key);
    };

    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) {
        const k = String(key);
        const v = String(value);
        if (memCache.get(k) === v) return; // 内容未变跳过写入，消除无效序列化卡顿
        memCache.set(k, v);
        pendingWrites.set(k, v);
        scheduleFlush();
        return;
      }
      return rawSet.call(this, key, value);
    };

    Storage.prototype.removeItem = function (key) {
      if (this === localStorage) {
        const k = String(key);
        memCache.delete(k);
        pendingWrites.set(k, null);
        scheduleFlush();
        return;
      }
      return rawRemove.call(this, key);
    };

    Storage.prototype.clear = function () {
      if (this === localStorage) {
        memCache.clear();
        pendingWrites.clear();
      }
      return rawClear.call(this);
    };

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow();
    });
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);
  } catch (e) {}

  // ========== 2. 渲染减负：限制高开销毛玻璃模糊与长列表触控加速 ==========
  const style = document.createElement('style');
  style.textContent = `
    * { -webkit-tap-highlight-color: transparent; }
    [class*="backdrop-blur"], [style*="backdrop-filter"] {
      -webkit-backdrop-filter: blur(6px) !important;
      backdrop-filter: blur(6px) !important;
      transform: translateZ(0);
    }
    main, [class*="overflow-y-auto"], [class*="scroll"] {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
    }
    #float-swipe-indicator {
      position: fixed;
      top: 50%;
      left: 0;
      width: 28px;
      height: 76px;
      margin-top: -38px;
      background: rgba(0, 0, 0, 0.45);
      color: #fff;
      border-radius: 0 18px 18px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      z-index: 999999;
      pointer-events: none;
      opacity: 0;
      transform: translateX(-100%);
      transition: opacity 0.15s ease;
    }
    #float-xhs-toast {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 36, 66, 0.94);
      color: #fff;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      pointer-events: none;
      transition: opacity 0.25s ease;
      opacity: 0;
    }
  `;
  document.head.appendChild(style);

  // ========== 3. 全局屏幕边缘滑动返回手势 ==========
  const indicator = document.createElement('div');
  indicator.id = 'float-swipe-indicator';
  indicator.textContent = '‹';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(indicator));
  if (document.body) document.body.appendChild(indicator);

  const triggerSmartBack = () => {
    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"], div[class*="cursor-pointer"]')
    );
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.top >= 0 && rect.top <= 120 && rect.left >= 0 && rect.left <= 110 && rect.width <= 90) {
        const text = (el.textContent || '').trim();
        const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
        const html = el.innerHTML.toLowerCase();
        if (
          text === '<' ||
          text === '‹' ||
          text === '←' ||
          text.includes('返回') ||
          aria.includes('back') ||
          aria.includes('返回') ||
          html.includes('chevron-left') ||
          html.includes('arrow-left')
        ) {
          el.click();
          return;
        }
      }
    }
    if (window.history.length > 1) {
      window.history.back();
    }
  };

  let startX = 0;
  let startY = 0;
  let trackingEdge = false;

  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const w = window.innerWidth;
      if (touch.clientX <= 28 || touch.clientX >= w - 28) {
        startX = touch.clientX;
        startY = touch.clientY;
        trackingEdge = true;
      } else {
        trackingEdge = false;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (!trackingEdge || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dy > 45) {
        trackingEdge = false;
        indicator.style.opacity = '0';
        return;
      }
      if (dx > 12) {
        const progress = Math.min(dx / 65, 1);
        indicator.style.opacity = String(progress);
        indicator.style.transform = `translateX(${(progress - 1) * 100}%)`;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchend',
    (e) => {
      if (!trackingEdge) return;
      trackingEdge = false;
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateX(-100%)';
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx >= 62 && dy < 45) {
        triggerSmartBack();
      }
    },
    { passive: true }
  );

  // ========== 4. 小红书链接粘贴自动解析 ==========
  const toast = document.createElement('div');
  toast.id = 'float-xhs-toast';
  if (document.body) document.body.appendChild(toast);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(toast));

  const showToast = (msg, duration = 2600) => {
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, duration);
  };

  const setReactInputValue = (el, newVal) => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, newVal);
    else el.value = newVal;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  window.addEventListener(
    'paste',
    async (e) => {
      const target = e.target;
      if (
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLInputElement)
      ) {
        return;
      }
      const pasted = e.clipboardData?.getData('text') || '';
      if (!/(xhslink\.cn|xhslink\.com|xiaohongshu\.com)/i.test(pasted)) return;

      showToast('正在解析小红书链接...');
      try {
        const res = await fetch('/api/xhs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: pasted }),
        });
        const data = await res.json();
        if (data && data.ok) {
          const parsedBlock =
            `\n【小红书笔记解析】\n标题：${data.title || '无标题'}\n内容：${data.desc || '无正文'}` +
            (data.images?.length ? `\n配图：${data.images[0]}` : '');
          const current = target.value || '';
          setReactInputValue(target, current + parsedBlock);
          showToast('小红书笔记解析成功！');
        } else {
          showToast('小红书链接已粘贴（未提取到公开摘要）');
        }
      } catch (err) {
        showToast('小红书解析请求失败');
      }
    },
    true
  );
})();
