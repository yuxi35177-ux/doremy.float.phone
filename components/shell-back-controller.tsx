"use client";
import { useEffect } from "react";

function visible(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight &&
    style.visibility !== "hidden" && style.display !== "none";
}
// Existing state navigation is exposed through the same buttons users already press.
// Hit testing excludes cached/mounted apps hidden behind the active page.
function reachable(node: HTMLElement) {
  if (!visible(node)) return false;
  const rect = node.getBoundingClientRect();
  const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
  const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
  const hit = document.elementFromPoint(x, y);
  return !!hit && (node === hit || node.contains(hit));
}
export function ShellBackController() {
  useEffect(() => {
    let lastBack = -Infinity;
    const canStart = (x: number, y: number) => {
      let node = document.elementFromPoint(x, y) as HTMLElement | null;
      while (node) {
        if (node.matches("input,textarea,select,[contenteditable=true],[role=slider],[data-shell-swipe-ignore],[data-no-swipe-back],[data-horizontal-scroll],.ui-swipe-wrap,canvas,video,iframe")) return false;
        const css = getComputedStyle(node);
        if (node.scrollWidth > node.clientWidth + 4 && /auto|scroll/.test(css.overflowX)) return false;
        node = node.parentElement;
      }
      return true;
    };
    const back = () => {
      // System gesture and optional native edge recognizer must never act twice.
      if (performance.now() - lastBack < 350) return true;
      lastBack = performance.now();
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("input,textarea,[contenteditable=true]")) {
        active.blur(); return true;
      }
      const buttons = Array.from(document.querySelectorAll<HTMLElement>(
        "[data-shell-back], button.page-back-btn[aria-label='返回'], button[aria-label='返回桌面']",
      )).filter(reachable);
      // A modal owns the back action before any page beneath it. Reuse its backdrop
      // cancel handler (never the confirm/save button). Nested PageShell goes first.
      const overlays = Array.from(document.querySelectorAll<HTMLElement>(".modal-overlay, .chat-html-overlay, [data-ui='modal']"))
        .filter(visible).filter(node => {
          const r = node.getBoundingClientRect();
          return [r.top + 2, r.top + r.height / 2, r.bottom - 2].some(y =>
            node.contains(document.elementFromPoint(Math.max(1, r.left + 2), Math.max(1, Math.min(innerHeight - 1, y)))));
        });
      const overlay = overlays.reverse().find(node => !overlays.some(other => other !== node && node.contains(other)));
      if (overlay) {
        const nested = buttons.find(button => overlay.contains(button));
        (nested ?? overlay).click();
        return true;
      }
      const beforePage = new Event("float-before-page-back", { cancelable: true });
      if (!window.dispatchEvent(beforePage)) return true;
      // Later DOM entries are nested panels in the shared page shells.
      if (buttons.length) { buttons[buttons.length - 1].click(); return true; }
      const event = new Event("float-navigation-back", { cancelable: true });
      if (!window.dispatchEvent(event)) return true;
      // Home and access page explicitly consume Back so native history cannot exit.
      if (document.querySelector("[data-active-app='']") || location.pathname === "/access") return true;
      return false;
    };
    const target = window as Window & { floatShellBack?: () => boolean; floatShellCanStartBack?: (x: number, y: number) => boolean };
    target.floatShellBack = back;
    target.floatShellCanStartBack = canStart;
    // Web/PWA gestures use the same modal/page/desktop handler as the APK.
    let gesture: { x: number; y: number; at: number; horizontal: boolean } | null = null;
    let suppressClickUntil = 0;
    const onStart = (event: TouchEvent) => {
      gesture = null;
      // Keep the simulated desktop's own horizontal page switching intact.
      const app = document.querySelector<HTMLElement>("[data-active-app]");
      if (!app?.dataset.activeApp || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!canStart(touch.clientX, touch.clientY)) return;
      gesture = { x: touch.clientX, y: touch.clientY, at: Date.now(), horizontal: false };
    };
    const onMove = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { gesture = null; return; }
      const dx = Math.abs(event.touches[0].clientX - gesture.x);
      const dy = Math.abs(event.touches[0].clientY - gesture.y);
      if (!gesture.horizontal) {
        if (dy > 12 && dy >= dx) { gesture = null; return; }
        if (dx > 14 && dx > dy * 1.5) gesture.horizontal = true;
      }
      if (gesture.horizontal && event.cancelable) event.preventDefault();
    };
    const onEnd = (event: TouchEvent) => {
      const start = gesture;
      gesture = null;
      if (!start || event.touches.length || Date.now() - start.at > 1200) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      if (dx < 64 || dx < dy * 1.8) return;
      if (event.cancelable) event.preventDefault();
      suppressClickUntil = Date.now() + 450;
      back();
    };
    const onCancel = () => { gesture = null; };
    const onClick = (event: MouseEvent) => {
      if (event.isTrusted && Date.now() < suppressClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    const guardKey = "__floatPhoneBackGuard";
    let guardReady = false;
    let restoring = false;
    const addGuard = () => {
      if (restoring || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
      if (!window.history.state?.[guardKey]) {
        window.history.pushState({ ...window.history.state, [guardKey]: true }, "", window.location.href);
      }
      guardReady = true;
    };
    const onPop = (event: PopStateEvent) => {
      if (!guardReady) return;
      if (restoring) { restoring = false; return; }
      if (event.state?.[guardKey]) return;
      // Revisit the existing guard, rather than push an unactivated entry which
      // Android/Chromium can skip on the next edge gesture.
      restoring = true;
      window.history.forward();
      back();
    };
    const onNativeBack = (event: Event) => { event.preventDefault(); back(); };
    addGuard();
    window.addEventListener("popstate", onPop);
    window.addEventListener("floatphone:back", onNativeBack);
    document.addEventListener("pointerup", addGuard, true);
    document.addEventListener("touchend", addGuard, true);
    document.addEventListener("touchstart", onStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onMove, { capture: true, passive: false });
    document.addEventListener("touchend", onEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", onCancel, true);
    document.addEventListener("click", onClick, true);
    return () => {
      delete target.floatShellBack; delete target.floatShellCanStartBack;
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("floatphone:back", onNativeBack);
      document.removeEventListener("pointerup", addGuard, true);
      document.removeEventListener("touchend", addGuard, true);
      document.removeEventListener("touchstart", onStart, true);
      document.removeEventListener("touchmove", onMove, true);
      document.removeEventListener("touchend", onEnd, true);
      document.removeEventListener("touchcancel", onCancel, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
