// One-shot navigation handoff. Archives still reopen with fresh caches, but
// the user stays on the profile page and never has to enter the app again.
const KEY = "float-persona-navigation-v1";
function readResume(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const value = JSON.parse(raw);
    if (!value.id || typeof value.at !== "number" || Date.now() - value.at > 120000 || value.at > Date.now()) return false;
    return ["float_phone_personas_v1", "float_identity_workspaces_v1"].some(key => {
      const routing = localStorage.getItem(key);
      return routing && JSON.parse(routing).activeId === value.id;
    });
  } catch { return false; }
}
let resuming = readResume();
export function isResumingPersona() { return resuming; }
export function beginPersonaNavigation(id: string) {
  sessionStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() }));
}
export function cancelPersonaNavigation() { sessionStorage.removeItem(KEY); }
export function completePersonaNavigation() {
  if (!resuming) return;
  resuming = false;
  sessionStorage.removeItem(KEY);
}
