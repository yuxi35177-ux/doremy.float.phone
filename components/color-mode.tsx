"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type ColorMode = "light" | "dark" | "system";
const STORAGE_KEY = "float-phone-color-mode";
const CHANGE_EVENT = "float-phone-color-mode-change";
let fallback: ColorMode = "system";
const isMode = (value: unknown): value is ColorMode => value === "light" || value === "dark" || value === "system";

function readMode(): ColorMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isMode(value) ? value : fallback;
  } catch { return fallback; }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) { fallback = "system"; listener(); }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function saveMode(mode: ColorMode) {
  fallback = mode;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* Keep the choice for this session. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Run before page content is painted to avoid a bright flash on a dark phone.
const BOOTSTRAP = `(function(){try{var m=localStorage.getItem("${STORAGE_KEY}");if(m!=="light"&&m!=="dark")m="system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.phoneColorMode=d?"dark":"light";document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){var d=matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.phoneColorMode=d?"dark":"light";document.documentElement.style.colorScheme=d?"dark":"light";}})();`;

const STYLES = `
html[data-phone-color-mode="dark"],
html[data-phone-color-mode="dark"] :is(.phone-shell,.chat-app,.page-shell) {
  --c-header-bg: #191c23 !important;
  --c-page-body-bg: #11141a !important;
  --c-card: #20252e !important;
  --c-card-border: #353c48 !important;
  --c-panel: #20252e !important;
  --c-panel-border: #3c4451 !important;
  --c-polaroid: #252a34 !important;
  --c-polaroid-back: #20252e !important;
  --c-text-title: #f0f2f6 !important;
  --c-text: #b4bdca !important;
  --c-icon-active: #e3e9f2 !important;
  --c-icon: #a0adbf !important;
  --c-input: #2a303b !important;
  --c-input-border: #475163 !important;
  --c-bubble-other: #292f3a !important;
  --c-overlay: rgba(0,0,0,.65) !important;
}
html[data-phone-color-mode="dark"] body { background-color: #11141a; color: var(--c-text-title); }
html[data-phone-color-mode="dark"] .chat-room-layer { background-color: var(--c-page-body-bg); }
html[data-phone-color-mode="dark"] :is(.chat-input-textarea,.chat-search-input) { color: var(--c-text-title); }
.color-mode-settings { margin: 0 0 20px; padding: 16px; border: 1px solid var(--c-card-border); border-radius: 18px; background: var(--c-card); min-width: 0; }
.color-mode-settings legend { padding: 0 6px; color: var(--c-text-title); font-size: 15px; font-weight: 600; }
.color-mode-options { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
.color-mode-option { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 4px; border: 1px solid var(--c-card-border); border-radius: 12px; color: var(--c-text); background: var(--c-panel); cursor: pointer; font-size: 13px; }
.color-mode-option:has(input:checked) { border-color: #779bff; background: color-mix(in srgb,#779bff 12%,var(--c-panel)); color: var(--c-text-title); box-shadow: inset 0 0 0 1px #779bff; }
.color-mode-option:has(input:focus-visible) { outline: 2px solid #779bff; outline-offset: 3px; }
.color-mode-option input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.color-mode-hint { margin: 12px 0 0; font-size: 12px; line-height: 1.6; color: var(--c-text); }
`;

export function ColorModeController() {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const mode = readMode();
      const dark = mode === "dark" || (mode === "system" && media.matches);
      const resolved = dark ? "dark" : "light";
      document.documentElement.dataset.phoneColorMode = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#191c23" : "#f8f7f2");
    };
    sync();
    media.addEventListener("change", sync);
    const unsubscribe = subscribe(sync);
    // Some Android browsers only report the new phone theme when resumed.
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      media.removeEventListener("change", sync);
      unsubscribe();
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return <><script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} /><style>{STYLES}</style></>;
}

const OPTIONS = [
  { value: "light", label: "日间", icon: Sun },
  { value: "dark", label: "夜间", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const;

export function ColorModeSettings() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as ColorMode);
  return (
    <fieldset className="color-mode-settings">
      <legend>显示模式</legend>
      <div className="color-mode-options">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <label key={value} className="color-mode-option">
            <input type="radio" name="phone-color-mode" value={value} checked={mode === value} onChange={() => saveMode(value)} />
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <p className="color-mode-hint">{mode === "system" ? "跟随手机的深色模式自动切换，也会跟随手机设置的定时切换。" : mode === "dark" ? "始终使用夜间模式。" : "始终使用日间模式。"}</p>
    </fieldset>
  );
}
