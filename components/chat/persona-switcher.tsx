"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, X, Plus } from "lucide-react";
import { loadUserIdentities, saveUserIdentities, loadBindingConfig } from "@/lib/settings-storage";
import { hydrateKvDb, isKvHydrated, kvSetAsync } from "@/lib/kv-db";
import { getIdentityWorkspace } from "@/lib/identity-workspace";

import { switchIdentityWorkspace } from "@/lib/identity-workspace-controller";
async function preparePersonaSwitch(id: string) {
  const config = structuredClone(loadBindingConfig());
  const clear = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "userIdentityId") delete (value as Record<string, unknown>)[key];
      else clear(child);
    }
  };
  clear(config);
  config.globalDefaults.userIdentityId = id;
  await switchIdentityWorkspace(id, JSON.stringify(config));
}
export function PersonaSwitcher() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [identities, setIdentities] = useState(loadUserIdentities);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const workspace = getIdentityWorkspace();
  const registry = workspace ? { activeId: workspace.activeId, ownerId: workspace.legacyOwnerId, ownerName: identities.find(i => i.id === workspace.legacyOwnerId)?.name || "未设置身份（原存档）" } : null;
  const choices = identities.map(i => ({ id: i.id, name: i.name || "未命名人设" }));
  if (registry && !choices.some(i => i.id === registry.ownerId)) choices.unshift({ id: registry.ownerId, name: registry.ownerName });
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { setOpen(false); triggerRef.current?.focus(); }
      if (e.key === "Tab") {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-persona-dialog] button:not(:disabled), [data-persona-dialog] input'));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);
  const switchTo = async (id: string) => {
    if (busy || id === registry?.activeId) return;
    setBusy(true); setError("");
    try { await preparePersonaSwitch(id); }
    catch { setError("未能完成存档保存，已留在当前人设。请稍后重试。"); setBusy(false); }
  };
  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await hydrateKvDb();
      if (!isKvHydrated()) throw new Error("storage unavailable");
      const identity = { id: `persona_${crypto.randomUUID()}`, name: name.trim(), bio: "", gender: "", age: "", occupation: "", customSettings: "" };
      const saved = loadUserIdentities();
      if (registry?.ownerId === "__default__" && !saved.some(i => i.id === registry.ownerId)) {
        saved.unshift({ id: registry.ownerId, name: "未设置身份", bio: "", gender: "", age: "", occupation: "", customSettings: "" });
      }
      const updated = [...saved, identity];
      // Await persistence before changing archive; a failed save never switches.
      await kvSetAsync("ai_phone_user_identities_v1", JSON.stringify(updated));
      saveUserIdentities(updated);
      setIdentities(updated);
      await preparePersonaSwitch(identity.id);
    } catch { setError("新增人设未完成，当前存档保持原样，请稍后重试。"); setBusy(false); }
  };
  const close = () => { if (!busy) { setOpen(false); triggerRef.current?.focus(); } };
  return <>
    <button ref={triggerRef} type="button" className="page-back-btn" aria-label="切换人设" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setIdentities(loadUserIdentities()); setError(""); setOpen(true); }}>
      <ChevronDown size={24} strokeWidth={1.7} />
    </button>
    {open && createPortal(<div className="modal-overlay" data-ui="modal" onClick={close} style={{ zIndex: 10000 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="persona-title" data-persona-dialog className="modal-dialog" onClick={e => e.stopPropagation()} style={{ width: "calc(100vw - 32px)", maxWidth: 360, display: "block", maxHeight: "80dvh", overflowY: "auto", background: "linear-gradient(var(--c-card),var(--c-card)), #fff", color: "var(--c-text-title)", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 id="persona-title" style={{ fontSize: 20, fontWeight: 700 }}>切换人设</h2>
          <button ref={closeRef} type="button" className="page-back-btn" aria-label="关闭人设切换" disabled={busy} onClick={close}><X size={22} /></button>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--c-text)", marginBottom: 16 }}>每个人设独立保存聊天、记忆、朋友圈和经历，切回即可恢复。原存档保留在人设“{registry?.ownerName}”下。</p>
        <div style={{ display: "grid", gap: 8 }}>
          {choices.map(i => <button type="button" key={i.id} disabled={busy || i.id === registry?.activeId} onClick={() => void switchTo(i.id)} aria-current={i.id === registry?.activeId ? "true" : undefined}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--c-card-border)", background: "var(--c-panel)", color: "var(--c-text-title)" }}>
            <span>{i.name}{i.id === registry?.ownerId ? " · 原存档" : ""}</span>{i.id === registry?.activeId && <Check size={18} aria-label="当前人设" />}
          </button>)}
        </div>
        <form onSubmit={e => { e.preventDefault(); void add(); }} style={{ display: "flex", width: "100%", gap: 8, marginTop: 18 }}>
          <input aria-label="新人设名称" placeholder="新人设名称" maxLength={50} value={name} disabled={busy} onChange={e => setName(e.target.value)} style={{ minWidth: 0, flex: 1, padding: 12, borderRadius: 12, background: "var(--c-input)", border: "1px solid var(--c-input-border)", color: "var(--c-text-title)" }} />
          <button type="submit" className="ui-btn ui-btn-primary" disabled={busy || !name.trim()}><Plus size={17} />新增</button>
        </form>
        <p style={{ fontSize: 12, color: "var(--c-text)", marginTop: 12 }}>人设详细资料可在设置 → 用户身份中编辑。切换会重新打开小手机。</p>
        {busy && <p role="status">正在保存并切换…</p>}
        {error && <p role="alert" style={{ color: "#e65e67", marginTop: 12 }}>{error}</p>}
      </section>
    </div>, document.body)}
  </>;
}
