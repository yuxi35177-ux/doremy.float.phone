const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, require, globals = {}) {
 const exports = {};
 const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require,console,Date,...globals});
 return exports;
}
(async () => {
 let settings = {}, accepted = false, count = 0, opened = 0;
 const bridge = {notify(...args){ count++; assert.equal(args.length,4); return accepted; },openAppSettings(){opened++;}};
 const shell = load('lib/shell-notify.ts', name => {
  assert.equal(name,'./chat-storage');
  return {loadChatAppSettings:()=>settings,saveChatAppSettings:value=>settings=value};
 },{window:{AndroidShell:bridge}});
 assert.equal(shell.isShellNotificationEnabled(),true);
 // A rejected notification must not poison dedupe and make a retry report success.
 assert.equal(shell.sendShellNotification('a','b',null,'s'),false);
 accepted=true; assert.equal(shell.sendShellNotification('a','b',null,'s'),true);assert.equal(count,2);
 assert.equal(shell.sendShellNotification('a','b',null,'s'),true);assert.equal(count,2);
 assert.equal(shell.sendShellNotification('a','b',null,'other'),true);assert.equal(count,3);
 shell.setShellNotificationEnabled(false);assert.equal(shell.sendShellNotification('c','d'),false);assert.equal(count,3);
 assert.equal(shell.testShellNotification().ok,false);
 shell.setShellNotificationEnabled(true);assert.equal(shell.testShellNotification().ok,true);
 assert.equal(shell.openShellNotificationSettings(),true);assert.equal(opened,1);
 const notices=load('lib/chat-notification-events.ts',()=>{throw Error('unexpected dependency')});
 assert.equal(notices.shouldSuppressChatNotice(false,true,false),true);
 assert.equal(notices.shouldSuppressChatNotice(false,true,true),false);
 assert.equal(notices.shouldSuppressChatNotice(false,false,false),false);
 assert.equal(notices.shouldSuppressChatNotice(true,true,false),false);
 let network=0;
 const push=load('lib/push-client.ts',name=>({
  './shell-notify':shell,'./self-hosting':{isSelfHostedModeEnabled:()=>true},
  './browser-notification':{},'./kv-db':{},
  './personal-push-cloud':{isPersonalPushCloudActive:()=>false},
  './shell-detect':{isShellEnvironment:()=>true},
 }[name] || (()=>{throw Error(name)})()),{window:{},fetch:()=>{network++;throw Error('local notification must not reach cloud')}});
 assert.equal((await push.sendShellTestPush()).ok,true);
 assert.equal((await push.sendTestOfflinePush()).ok,false);
 assert.equal(await push.getOfflinePushState(),'off');assert.equal(network,0);
 console.log('PASS: background active-chat notices, foreground/test policy, default-on/persisted switch, failed-send retry, session dedupe, settings bridge, local test with zero cloud calls');
})().catch(e=>{console.error(e);process.exitCode=1});
