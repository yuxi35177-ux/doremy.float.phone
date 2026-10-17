// Dispatch regression tests with a deterministic DOM adapter; real Android gestures
// and visual stacking still require device testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const actions = [];
let now = 1000;
class Element {
  constructor(name, parent = null) { this.name = name; this.parentElement = parent; this.hidden = false; this.scrollWidth = this.clientWidth = 100; this.style = { display: 'block', visibility: 'visible', overflowX: 'visible' }; }
  getBoundingClientRect() { return { width: this.hidden ? 0 : 100, height: 40, left: 0, top: 0, bottom: 40 }; }
  contains(node) { for (; node; node = node.parentElement) if (node === this) return true; return false; }
  matches() { return this.editable === true; }
  click() { actions.push(this.name); }
  blur() { document.activeElement = null; }
}
const document = { activeElement: null, querySelectorAll: selector => selector.startsWith('[data-shell-back]') ? buttons : overlays, querySelector: () => home ? {} : null, elementFromPoint: () => hit };
const window = new EventTarget();
let buttons = [], overlays = [], hit = null, home = false;
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync('components/shell-back-controller.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports: exportsObject, require: () => ({ useEffect: fn => fn() }), Event, window, document, HTMLElement: Element, performance: { now: () => now }, location: { pathname: '/' }, innerWidth: 390, innerHeight: 844, getComputedStyle: node => node.style });
exportsObject.ShellBackController();
function back() { now += 500; return window.floatShellBack(); }
const page = new Element('chat');
const modal = new Element('modal');
const nested = new Element('nested', modal);
buttons = [page, nested]; overlays = [modal]; hit = nested;
assert.equal(back(), true); assert.deepEqual(actions, ['nested']);
assert.equal(window.floatShellBack(), true); assert.equal(actions.length, 1); // duplicate event
buttons = [page]; hit = modal;
assert.equal(back(), true); assert.equal(actions.at(-1), 'modal');
overlays = []; hit = page;
const closePanel = event => { actions.push('chat-menu'); event.preventDefault(); };
window.addEventListener('float-before-page-back', closePanel, { once: true });
assert.equal(back(), true); assert.equal(actions.at(-1), 'chat-menu');
assert.equal(back(), true); assert.equal(actions.at(-1), 'chat');
page.hidden = true;
const desktop = event => { actions.push('desktop'); event.preventDefault(); };
window.addEventListener('float-navigation-back', desktop, { once: true });
assert.equal(back(), true); assert.equal(actions.at(-1), 'desktop');
assert.equal(back(), false); // native may use same-site history
home = true; assert.equal(back(), true); // home consumes without navigation
const input = new Element('input'); input.editable = true; hit = input; document.activeElement = input;
assert.equal(window.floatShellCanStartBack(1,1), false);
assert.equal(back(), true); assert.equal(document.activeElement, null);
const horizontal = new Element('horizontal'); horizontal.scrollWidth = 500; horizontal.style.overflowX = 'auto'; hit = horizontal;
assert.equal(window.floatShellCanStartBack(1,1), false);
console.log('PASS: nested page/modal/chat-menu/chat/desktop priority, hidden pages, duplicate events, home, history fallback, input and horizontal gesture exclusion');
