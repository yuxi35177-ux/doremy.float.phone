import { kvGet, commitIdentityRouting, flushIdentityKvWrites } from "./kv-db";
import { IDENTITY_WORKSPACE_KEY, adoptLegacyWorkspace, getIdentityWorkspace,
    markIdentityWorkspaceSwitching, parseIdentityWorkspace, getIdentityDatabases, type IdentityWorkspace } from "./identity-workspace";

export async function initializeIdentityWorkspace(currentIdentityId: string): Promise<boolean> {
    const raw = kvGet(IDENTITY_WORKSPACE_KEY);
    const durable = raw ? parseIdentityWorkspace(raw) : getIdentityWorkspace() ?? {
        version: 1 as const, legacyOwnerId: currentIdentityId, activeId: currentIdentityId,
    };
    const boot = getIdentityWorkspace();
    // Recover routing if localStorage alone was cleared; never reassign the old archive.
    if ((boot && (boot.activeId !== durable.activeId || boot.legacyOwnerId !== durable.legacyOwnerId)) ||
        (!boot && durable.activeId !== durable.legacyOwnerId)) {
        window.localStorage.setItem(IDENTITY_WORKSPACE_KEY, JSON.stringify(durable));
        window.location.reload();
        return false;
    }
    await commitIdentityRouting(durable);
    window.localStorage.setItem(IDENTITY_WORKSPACE_KEY, JSON.stringify(durable));
    adoptLegacyWorkspace(durable);
    return true;
}

export async function switchIdentityWorkspace(identityId: string, bindings: string): Promise<void> {
    const current = getIdentityWorkspace();
    if (!current) throw new Error("人设存档尚未初始化，请重新打开小手机后再切换。");
    if (current.activeId === identityId) return;
    markIdentityWorkspaceSwitching(true);
    window.dispatchEvent(new Event("identity-workspace-before-switch"));
    const overlay = document.createElement("div");
    overlay.textContent = "正在保存并切换人设存档…";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#f6f6f6;color:#333;font-size:16px";
    document.body.appendChild(overlay);
    try {
        await flushIdentityKvWrites();
        // Empty transactions form barriers behind writes already queued on each connection.
        await Promise.all(getIdentityDatabases().filter(db => db.isOpen() && db.tables.length)
            .map(db => db.transaction("rw", db.tables, async () => {})));
        const next: IdentityWorkspace = { ...current, activeId: identityId };
        await commitIdentityRouting(next, bindings);
        window.localStorage.setItem(IDENTITY_WORKSPACE_KEY, JSON.stringify(next));
        window.location.reload();
    } catch (error) {
        // Resume by reloading the same durable routing. Never expose a half-switched UI.
        overlay.textContent = "切换未完成，旧存档仍保留。请重新打开后重试。";
        const button = document.createElement("button");
        button.textContent = "重新打开";
        button.onclick = () => window.location.reload();
        overlay.appendChild(button);
        throw error;
    }
}

export function watchIdentityWorkspaceChanges(): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === IDENTITY_WORKSPACE_KEY && event.newValue) {
            markIdentityWorkspaceSwitching(true);
            window.dispatchEvent(new Event("identity-workspace-before-switch"));
            window.location.reload();
        }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
