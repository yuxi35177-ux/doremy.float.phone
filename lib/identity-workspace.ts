import type Dexie from "dexie";
/** Storage boundaries are pinned for this page's lifetime. Switching reloads the page. */
import { DATA_MODULES } from "./data-management/modules";

export const IDENTITY_WORKSPACE_KEY = "float_identity_workspaces_v1";
export const IDENTITY_DEFERRED_REPLIES_KEY = "float_identity_deferred_replies_v1";
const PREFIX = "::identity:";
export type IdentityWorkspace = { version: 1; legacyOwnerId: string; activeId: string };
function readBootWorkspace(): IdentityWorkspace | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(IDENTITY_WORKSPACE_KEY);
    if (raw === null) return null;
    return parseIdentityWorkspace(raw);
}
export function parseIdentityWorkspace(raw: string): IdentityWorkspace {
    const value = JSON.parse(raw) as IdentityWorkspace;
    if (value?.version !== 1 || !value.legacyOwnerId || !value.activeId ||
        typeof value.legacyOwnerId !== "string" || typeof value.activeId !== "string") {
        throw new Error("人设存档索引损坏，请保留本机数据并从备份恢复，不能自动重置归属。");
    }
    return value;
}
let workspace = readBootWorkspace();
let switching = false;
export function getWorkspaceIdentityId(): string | null { return workspace?.activeId ?? null; }
export function getIdentityWorkspace(): IdentityWorkspace | null { return workspace; }
export function adoptLegacyWorkspace(value: IdentityWorkspace): void {
    // The first owner keeps the original DBs. No record moves or deletes.
    if (workspace && (workspace.activeId !== value.activeId || workspace.legacyOwnerId !== value.legacyOwnerId)) {
        throw new Error("存档空间已变化，需要重新加载页面。");
    }
    workspace = Object.freeze({ ...value });
}
export function isIdentityWorkspaceSwitching(): boolean { return switching; }
export function markIdentityWorkspaceSwitching(value: boolean): void { switching = value; }

const sharedModules = new Set(["settings", "characters", "desktop", "resource_hub"]);
const sharedKeys = new Set<string>([IDENTITY_WORKSPACE_KEY, IDENTITY_DEFERRED_REPLIES_KEY, "ai_phone_cloud_backup_config_v1",
    "ai_phone_agent_computer_cfg_v1", "ai_phone_qa_github_v1"]);
const sharedPrefixes: string[] = [];
for (const module of DATA_MODULES) {
    if (!sharedModules.has(module.id)) continue;
    for (const source of module.sources) {
        if (source.type !== "kv") continue;
        source.keys?.forEach(key => sharedKeys.add(key));
        source.prefixes?.forEach(prefix => sharedPrefixes.push(prefix));
    }
}
// Scheduling is experience, even though its controls appear beside API settings.
for (const key of ["ai_phone_idle_reconnect_rules_v1", "moments_signature", "moments_cover_asset_v1", "moments_cover_asset_id"]) sharedKeys.delete(key);
// Private records default to isolated; reusable configuration/resources stay shared.
function isSharedKey(key: string): boolean {
    return sharedKeys.has(key) || sharedPrefixes.some(prefix => key.startsWith(prefix));
}
function suffix(): string {
    return workspace && workspace.activeId !== workspace.legacyOwnerId
        ? PREFIX + encodeURIComponent(workspace.activeId) : "";
}
export function workspaceKvKey(key: string): string {
    if (key.includes(PREFIX)) throw new Error("不能直接访问其他人设的存档键。");
    return isSharedKey(key) ? key : key + suffix();
}
/** Project physical KV records to this workspace's logical backup/tool view. */
export function visibleWorkspaceKvKey(physical: string): string | null {
    if (physical === IDENTITY_WORKSPACE_KEY || physical === IDENTITY_DEFERRED_REPLIES_KEY) return null; // Device routing is never restored from a backup.
    const index = physical.indexOf(PREFIX);
    if (index < 0) return isSharedKey(physical) || !suffix() ? physical : null;
    const logical = physical.slice(0, index);
    return !isSharedKey(logical) && physical.slice(index) === suffix() ? logical : null;
}
const privateDatabases = new Set<string>([
    "AiPhoneMediaCacheDB", "AiPhoneMascotDB", "AiPhoneChatDB", "AiPhoneMomentsDB", "AiPhoneQaDB", "ai_phone_memory_db_v1",
    "AiPhoneCheckPhoneDB", "AiPhoneStoryDB", "AiPhoneVnDB", "AiPhoneMapDB", "AiPhoneDwellingDB",
]);
export function workspaceDbName(name: string): string {
    if (name.includes(PREFIX)) throw new Error("不能直接访问其他人设的数据库。");
    return privateDatabases.has(name) ? name + suffix() : name;
}

const connections = new Set<Dexie>();
export function registerIdentityDatabase(db: Dexie): void { connections.add(db); }
export function getIdentityDatabases(): Dexie[] { return [...connections]; }
