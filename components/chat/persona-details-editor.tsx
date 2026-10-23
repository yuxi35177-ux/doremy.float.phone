"use client";
import { useState } from "react";
import type { UserIdentity } from "@/components/settings/user-identity";

export function PersonaDetailsEditor({ identity, creating, onSave, onCancel }: {
  identity: UserIdentity; creating: boolean; onSave: (value: UserIdentity) => Promise<void>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(identity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof UserIdentity, value: string) => setDraft(old => ({ ...old, [key]: value }));
  const control = { width: "100%", padding: 10, marginTop: 6, borderRadius: 10, background: "var(--c-input)", color: "var(--c-text-title)", border: "1px solid var(--c-input-border)", fontSize: 14 };
  return <form onSubmit={async e => {
    e.preventDefault(); if (!draft.name.trim() || busy) return;
    setBusy(true); setError("");
    try { await onSave({ ...draft, name: draft.name.trim() }); }
    catch { setError("资料未能保存，请重试。原记录保持不变。"); setBusy(false); }
  }} style={{ display: "grid", gap: 14 }}>
    <h3 style={{ fontSize: 18, fontWeight: 700 }}>{creating ? "新增人设资料" : "编辑人设资料"}</h3>
    <label>姓名<input required aria-label="人设姓名" maxLength={80} value={draft.name} disabled={busy} onChange={e => update("name", e.target.value)} style={control} /></label>
    <label>头像链接<input aria-label="头像链接" value={draft.avatarUrl || ""} disabled={busy} onChange={e => update("avatarUrl", e.target.value)} style={control} placeholder="图片网址，也可以从下面上传" /></label>
    {draft.avatarUrl && <img src={draft.avatarUrl} alt="人设头像预览" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />}
    <label>上传头像<input type="file" accept="image/*" aria-label="上传人设头像" disabled={busy} style={{ display: "block", width: "100%", marginTop: 6 }} onChange={e => {
      const file = e.target.files?.[0]; if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setError("请选择 5MB 以内的图片。"); return; }
      const reader = new FileReader(); reader.onload = () => update("avatarUrl", String(reader.result)); reader.onerror = () => setError("图片读取失败，请重试。"); reader.readAsDataURL(file);
    }} /></label>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <label>性别<input aria-label="人设性别" value={draft.gender} disabled={busy} onChange={e => update("gender", e.target.value)} style={control} /></label>
      <label>年龄<input aria-label="人设年龄" value={draft.age} disabled={busy} onChange={e => update("age", e.target.value)} style={control} /></label>
    </div>
    <label>身份／职业<input aria-label="身份或职业" value={draft.occupation} disabled={busy} onChange={e => update("occupation", e.target.value)} style={control} /></label>
    <label>个人简介<textarea aria-label="个人简介" rows={3} value={draft.bio} disabled={busy} onChange={e => update("bio", e.target.value)} style={control} /></label>
    <label>详细人设／背景设定<textarea aria-label="详细人设和背景设定" rows={7} value={draft.customSettings} disabled={busy} onChange={e => update("customSettings", e.target.value)} style={control} placeholder="外貌、性格、经历、关系、说话习惯等" /></label>
    {error && <p role="alert" style={{ color: "#e65e67" }}>{error}</p>}
    <div style={{ display: "flex", gap: 10 }}>
      <button type="button" className="ui-btn ui-btn-outline" disabled={busy} onClick={onCancel}>取消</button>
      <button type="submit" className="ui-btn ui-btn-primary" disabled={busy || !draft.name.trim()}>{busy ? "正在保存…" : creating ? "保存并切换" : "保存资料"}</button>
    </div>
  </form>;
}
