# User identity archives

Switching a user identity now opens a separate experience archive. Settings →
User Identity exposes a switch button. Existing identity selectors in bindings
also select the archive for the whole phone; identity overrides no longer mix
multiple user personas inside the active archive.

On the first successful startup after upgrade, the current resolved global
identity owns the original databases and keys. No messages, contacts or memories
are moved or deleted. Other identities use namespaced stores. The ownership index
is durable in IndexedDB and mirrored in localStorage for early database selection.
Clearing the mirror alone recovers from IndexedDB and reloads before opening chat.
A conflicting or corrupt routing index fails closed rather than adopting archives.

Isolated data includes chats/contacts/groups, memories and timeline KV records,
wallets and other private KV state, social posts, story/VN/map/dwelling/check-phone
records, assistant chats and message media. API/provider configuration, identity
cards, character templates, presets/world books/regexes, desktop/theme resources
and imported reading/music libraries remain reusable resources. This is experience
separation within one browser installation, not a security sandbox for untrusted
plugins or protection against code with access to the same origin.

A switch aborts in-flight chat calls, stops follow-up scheduling, flushes pending
KV writes and barriers queued Dexie writes, then commits the new routing and
binding selection atomically. It reloads the page to drop old caches. The old
page's storage scope and resolved identity remain pinned until unload. Other tabs
reload on a routing change. A failed switch keeps the old archive and offers reload.
Native notification replies for inactive sessions are deferred until that archive
is opened rather than creating a session under another persona.

Backup exports, clears and built-in phone lookup tools use logical store names
resolved into the active archive. Private KV keys from other personas are excluded.
Routing and cross-persona deferred replies cannot be imported from a backup. Back
up each persona's experience archive separately; reusable resources are shared.
Deleting the active identity is blocked. Deleting another identity card does not
purge its stored archive.

Validation: `node scripts/check-identity-workspaces.cjs` uses fake IndexedDB with
real Dexie and production storage modules. It covers pre-upgrade records, A→B→A,
memories, private KV versus shared API configuration, pinned old-page scope,
backup/clear boundaries, routing recovery and rejected legacy ownership changes.
No Android package or signing certificate changes are required.
