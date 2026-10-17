(function () {
  if (window.__FLOAT_PERF_V2_LOADED__) return;
  window.__FLOAT_PERF_V2_LOADED__ = true;

  // ========== 1. 终极性能暴力解脱：干掉安卓 WebView 的显卡杀手（实时模糊） ==========
  const style = document.createElement('style');
  style.id = 'float-nuclear-perf';
  style.textContent = `
    * {
      -webkit-tap-highlight-color: transparent !important;
      outline: none !important;
    }
    /* 彻底关闭导致安卓掉帧卡顿的 backdrop-filter 实时显卡拷贝，换成丝滑高透背景 */
    [class*="backdrop-blur"],
    [style*="backdrop-filter"],
    [class*="bg-white/"],
    [class*="bg-black/"] {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    /* 强制所有可滚动列表启用 GPU 异步图层与原生惯性滑动 */
    main, [class*="overflow-y-auto"], [class*="scroll"], ul, ol {
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior-y: contain !important;
      touch-action: pan-y !important;
      transform: translateZ(0);
    }
    /* 提示条样式 */
    #float-toast {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 30, 35, 0.92);
      color: #fff;
      padding: 8px 18px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      z-index: 9999999;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      pointer-events: none;
      transition: opacity 0.25s ease;
      opacity: 0;
    }
  `;
  document.head.appendChild(style);

  // Storage remains native and synchronous. Persona routing is committed to
  // IndexedDB before its localStorage boot mirror is written and the page reloads.
  // Delayed Storage.prototype writes can strand that mirror or resurrect old keys.

  // ========== 3. 核心：拦截 vivo 系统级返回手势（防直接退出桌面） ==========
  const toast = document.createElement('div');
  toast.id = 'float-toast';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(toast));
  if (document.body) document.body.appendChild(toast);

  const showToast = (msg, duration = 2000) => {
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, duration);
  };

  const findInAppBackButton = () => {
    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"], div[class*="cursor-pointer"]')
    );
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // 位于屏幕顶部或左上角的返回控件
      if (rect.top >= 0 && rect.top <= 140 && rect.left >= 0 && rect.left <= 130) {
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
          html.includes('arrow-left') ||
          html.includes('lucide-arrow')
        ) {
          return el;
        }
      }
    }
    return null;
  };

  // 维护一个页面深度栈，拦截 vivo 侧滑返回
  let lastBackPressTime = 0;
  const pushGuardState = () => {
    try {
      window.history.pushState({ floatSubPage: true }, '');
    } catch (e) {}
  };

  // 监听用户点击进入任意子功能时自动挂载防退手势网
  document.addEventListener(
    'click',
    (e) => {
      setTimeout(() => {
        const btn = findInAppBackButton();
        if (btn) {
          pushGuardState();
        }
      }, 350);
    },
    true
  );

  // 核心拦截点：当 vivo 系统侧滑返回触发浏览器的 popstate 时
  window.addEventListener('popstate', (e) => {
    const backBtn = findInAppBackButton();
    if (backBtn) {
      // 找到了小手机内部的返回按钮，模拟点击返回上一层
      backBtn.click();
      // 如果还在子页面内，继续压入一层防护网
      setTimeout(() => {
        if (findInAppBackButton()) pushGuardState();
      }, 300);
    } else {
      // 已经在小手机桌面了，提示双击退出，防止手滑退到手机系统桌面
      const now = Date.now();
      if (now - lastBackPressTime < 1800) {
        // 允许退出
      } else {
        lastBackPressTime = now;
        pushGuardState();
        showToast('已在桌面，再次侧滑退出小手机');
      }
    }
  });

  // 初始进入也铺设一次手势防线
  setTimeout(pushGuardState, 1000);

  // ========== 4. 小红书链接自动解析 ==========
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
          showToast('已粘贴链接（未提取到公开文本）');
        }
      } catch (err) {
        showToast('小红书解析服务异常');
      }
    },
    true
  );
})();
