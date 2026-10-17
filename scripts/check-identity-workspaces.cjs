const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const Dexie = require('dexie').default;
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
class Storage {
 constructor(){this.values=new Map();}
 get length(){return this.values.size;}
 key(i){return [...this.values.keys()][i]??null;}
 getItem(k){return this.values.get(k)??null;}
 setItem(k,v){this.values.set(k,String(v));}
 removeItem(k){this.values.delete(k);}
}
const storage = new Storage();
function tab() {
 const cache=new Map();
 const window=new EventTarget();window.localStorage=storage;
 window.location={reload(){window.reloads=(window.reloads||0)+1;}};
 const document={body:{appendChild(){}},createElement:()=>({style:{},appendChild(){}})};
 function load(file) {
  const absolute=path.resolve(file);
  if(cache.has(absolute))return cache.get(absolute).exports;
  const module={exports:{}};cache.set(absolute,module);
  const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const scopedRequire=name=>{
   if(!name.startsWith('.')&&!name.startsWith('@/'))return require(name);
   const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(absolute),name);
   const target=['.ts','.tsx','.js',''].map(ext=>base+ext).find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
   if(!target)throw Error('Missing module '+name+' from '+file);
   return load(target);
  };
  vm.runInNewContext(code,{module,exports:module.exports,require:scopedRequire,window,document,localStorage:storage,
   indexedDB,IDBKeyRange,console,setTimeout,clearTimeout,Event,CustomEvent,DOMException,structuredClone,Blob,TextEncoder,TextDecoder,atob,btoa,crypto:require('node:crypto').webcrypto},{filename:absolute});
  return module.exports;
 }
 return {load,window};
}
async function close(t){for(const db of t.load('lib/identity-workspace.ts').getIdentityDatabases())db.close();}
(async()=>{
 // Existing release data, created BEFORE the isolation module is loaded.
 const old=new Dexie('AiPhoneChatDB');old.version(1).stores({messages:'id,sessionId,createdAt',sessions:'id,contactId',contacts:'id,characterId'});
 await old.sessions.put({id:'session-A',contactId:'same-character'});
 await old.messages.put({id:'message-A',sessionId:'session-A',content:'A-only'});old.close();
 let a=tab();let kv=a.load('lib/kv-db.ts');await kv.hydrateKvDb();
 kv.kvSet('ai_phone_api_configs_v1','shared-api');kv.kvSet('wallet-state','wallet-A');
 kv.kvSet('native_timeline:same-character','timeline-A');
 let control=a.load('lib/identity-workspace-controller.ts');
 await control.initializeIdentityWorkspace('persona-A');
 let scope=a.load('lib/identity-workspace.ts');
 assert.equal(scope.getIdentityWorkspace().legacyOwnerId,'persona-A');
 assert.equal(scope.workspaceDbName('AiPhoneChatDB'),'AiPhoneChatDB');
 const chats=a.load('lib/chat-db.ts');assert.equal((await chats.initChatDb()).messages[0].content,'A-only');
 const memory=a.load('lib/memory-storage.ts');
 await memory.saveMemoryEntry({id:'memory-A',characterId:'same-character',sourceApp:'chat',type:'long_term',content:'A memory',createdAt:'2026-01-01',updatedAt:'2026-01-01',importance:1});
 await control.switchIdentityWorkspace('persona-B','{"globalDefaults":{"userIdentityId":"persona-B"}}');
 assert.equal(a.window.reloads,1);
 assert.equal(scope.getWorkspaceIdentityId(),'persona-A'); // old task realm remains pinned
 assert.equal(kv.kvGet('wallet-state'),'wallet-A');
 await close(a);
 let b=tab();kv=b.load('lib/kv-db.ts');await kv.hydrateKvDb();control=b.load('lib/identity-workspace-controller.ts');await control.initializeIdentityWorkspace('persona-B');
 scope=b.load('lib/identity-workspace.ts');
 assert.notEqual(scope.workspaceDbName('AiPhoneChatDB'),'AiPhoneChatDB');
 assert.equal((await b.load('lib/chat-db.ts').initChatDb()).messages.length,0);
 assert.equal((await b.load('lib/memory-storage.ts').loadMemoryEntries('same-character')).length,0);
 assert.equal(kv.kvGet('wallet-state'),null);assert.equal(kv.kvGet('native_timeline:same-character'),null);
 assert.equal(kv.kvGet('ai_phone_api_configs_v1'),'shared-api');
 kv.kvSet('wallet-state','wallet-B');await kv.flushIdentityKvWrites();
 await b.load('lib/chat-db.ts').chatDb.messages.put({id:'message-B',sessionId:'session-B',content:'B-only'});
 await b.load('lib/memory-storage.ts').saveMemoryEntry({id:'memory-B',characterId:'same-character',sourceApp:'chat',type:'core',content:'B memory',createdAt:'2026-01-01',updatedAt:'2026-01-01',importance:1});
 const backup=b.load('lib/data-management/idb.ts');
 const exported=await backup.exportSource({type:'indexeddb',dbName:'AiPhoneChatDB'});
 assert.equal(exported.dbName,'AiPhoneChatDB');
 assert.deepEqual(Array.from(exported.stores.find(s=>s.name==='messages').records,r=>r.value.content),['B-only']);
 const kvExport=await backup.exportSource({type:'kv',includeAll:true});
 assert.ok(!kvExport.records.some(r=>r.value==='wallet-A'||r.value==='timeline-A'));
 assert.ok(!kvExport.records.some(r=>r.key.includes('::identity:')||r.key===scope.IDENTITY_WORKSPACE_KEY));
 // Clearing B's private KV must never issue a raw delete against legacy A's key.
 await backup.clearSource({type:'kv',keys:['wallet-state']});
 assert.equal(kv.kvGet('wallet-state'),null);
 await backup.importSource({type:'kv',records:[{key:scope.IDENTITY_WORKSPACE_KEY,value:'corrupt'}]},true);
 assert.equal(JSON.parse(kv.kvGet(scope.IDENTITY_WORKSPACE_KEY)).legacyOwnerId,'persona-A');
 // Clearing B must not clear legacy A.
 await backup.clearSource({type:'indexeddb',dbName:'AiPhoneChatDB'});
 await control.switchIdentityWorkspace('persona-A','{"globalDefaults":{"userIdentityId":"persona-A"}}');await close(b);
 a=tab();kv=a.load('lib/kv-db.ts');await kv.hydrateKvDb();control=a.load('lib/identity-workspace-controller.ts');await control.initializeIdentityWorkspace('persona-A');
 assert.equal(kv.kvGet('wallet-state'),'wallet-A');
 assert.equal((await a.load('lib/chat-db.ts').initChatDb()).messages[0].content,'A-only');
 assert.equal((await a.load('lib/memory-storage.ts').loadMemoryEntries('same-character'))[0].content,'A memory');
 // Lost routing mirror: recover from durable KV, never adopt a new legacy owner.
 await control.switchIdentityWorkspace('persona-B','{"globalDefaults":{"userIdentityId":"persona-B"}}');await close(a);
 storage.removeItem('float_identity_workspaces_v1');
 const recovery=tab();kv=recovery.load('lib/kv-db.ts');await kv.hydrateKvDb();
 assert.equal(await recovery.load('lib/identity-workspace-controller.ts').initializeIdentityWorkspace('persona-B'),false);
 assert.equal(JSON.parse(storage.getItem('float_identity_workspaces_v1')).legacyOwnerId,'persona-A');
 await close(recovery);
 // The storage transaction must reject assigning the legacy archive to someone else.
 const last=tab();const lastKv=last.load('lib/kv-db.ts');await lastKv.hydrateKvDb();
 await assert.rejects(lastKv.commitIdentityRouting({version:1,legacyOwnerId:'other-owner',activeId:'persona-B'}));
 assert.equal(JSON.parse(storage.getItem('float_identity_workspaces_v1')).legacyOwnerId,'persona-A');
 await close(last);
 // Exercise the real identity/binding selection path, including its import graph.
 const picker=tab();const pkv=picker.load('lib/kv-db.ts');await pkv.hydrateKvDb();
 await picker.load('lib/identity-workspace-controller.ts').initializeIdentityWorkspace('persona-B');
 pkv.kvSet('ai_phone_user_identities_v1',JSON.stringify([{id:'persona-A',name:'A'},{id:'persona-B',name:'B'}]));
 await pkv.flushIdentityKvWrites();
 const settings=picker.load('lib/settings-storage.ts');
 assert.equal(settings.resolveUserIdentity().id,'persona-B');
 settings.activateUserIdentity('persona-A');
 for(let i=0;i<100&&!picker.window.reloads;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(picker.window.reloads,1);
 assert.equal(JSON.parse(storage.getItem('float_identity_workspaces_v1')).activeId,'persona-A');
 assert.equal(settings.resolveUserIdentity().id,'persona-B'); // old in-flight tasks keep their original identity
 await close(picker);
 assert.throws(()=>scope.parseIdentityWorkspace('{"version":1}'));
 assert.throws(()=>scope.workspaceDbName('AiPhoneChatDB::identity:persona-A'));
 // A reply to an old persona's Android notification must wait for that persona.
 const replyValues=new Map();let native=[{id:'r-A',sessionId:'session-A',text:'private reply A',at:1}];let currentSessions=[{id:'session-B'}];const delivered=[];
 const replyExports={};const replyCode=ts.transpileModule(fs.readFileSync('lib/notification-reply.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const replyWindow={AndroidShell:{consumePendingReplies(){const items=native;native=[];return JSON.stringify(items);}}};
 vm.runInNewContext(replyCode,{exports:replyExports,console,window:replyWindow,require:name=>({
  './identity-workspace':{IDENTITY_DEFERRED_REPLIES_KEY:'deferred',isIdentityWorkspaceSwitching:()=>false},
  './kv-db':{kvGet:key=>replyValues.get(key)??null,kvSetAsync:async(key,value)=>replyValues.set(key,value)},
  './chat-storage':{hydrateChatStorage:async()=>{},loadChatSessions:()=>currentSessions,pushChatMessage:message=>delivered.push(message)},
  './follow-up-service':{requestBackgroundChatReply:async()=>{}},'./shell-call-overlay':{},
 }[name]||{})});
 assert.equal(await replyExports.flushPendingNotificationReplies(),0);assert.equal(delivered.length,0);
 currentSessions=[{id:'session-A'}];assert.equal(await replyExports.flushPendingNotificationReplies(),1);
 assert.equal(delivered[0].sessionId,'session-A');assert.equal(delivered[0].content,'private reply A');
 assert.equal(await replyExports.flushPendingNotificationReplies(),0);
 console.log('PASS identity workspaces: old archive retained; A→B→A; chats/memory/KV isolated; shared resources; pinned background scope; backup/clear boundaries; missing mirror recovery; corrupt routing fails closed.');
})().catch(error=>{console.error(error);process.exitCode=1});
