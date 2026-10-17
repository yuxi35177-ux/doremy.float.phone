(function () {
  if (window.__FLOAT_PERF_V2_LOADED__) return;
  window.__FLOAT_PERF_V2_LOADED__ = true;

  // Shared toast styling; rendering optimizations live in the desktop components.
  const style = document.createElement('style');
  style.id = 'float-nuclear-perf';
  style.textContent = `
    * {
      -webkit-tap-highlight-color: transparent !important;
      outline: none !important;
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

  // Navigation has one owner: ShellBackController + the Android dispatcher.
  // Do not push synthetic history on clicks or maintain another popstate stack.

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
