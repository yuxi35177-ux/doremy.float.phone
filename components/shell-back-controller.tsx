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
    let lastBack = 0;
    const canStart = (x: number, y: number) => {
      let node = document.elementFromPoint(x, y) as HTMLElement | null;
      while (node) {
        if (node.matches("input,textarea,select,[contenteditable=true],[data-shell-swipe-ignore]")) return false;
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
    return () => { delete target.floatShellBack; delete target.floatShellCanStartBack; };
  }, []);
  return null;
}
