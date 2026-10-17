const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const wait = () => new Promise(r => setImmediate(r));
function load(window, fetch = () => { throw Error('must not reach remote fetch'); }) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('lib/local-api-fetch.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, { exports, window, fetch, URL, Headers, Response, ReadableStream,
    Uint8Array, atob, crypto: webcrypto, DOMException, setTimeout, clearTimeout });
  return exports;
}
(async () => {
  const sent = [];
  const bridge = { onmessage: null, postMessage(s) { sent.push(JSON.parse(s)); } };
  const api = load({ FloatLocalApi: bridge, AndroidShell: {} });
  for (const u of ['http://127.0.0.1:7860/v1', 'http://localhost:7860/v1', 'http://[::1]:7860/v1']) assert.ok(api.isLoopbackApiUrl(u));
  for (const u of ['https://127.0.0.1.evil.test/v1', 'http://localhost.evil/v1', '/api/llm-proxy', 'file:///etc/passwd']) assert.ok(!api.isLoopbackApiUrl(u));
  const emit = (id, type, extra = {}) => bridge.onmessage({ data: JSON.stringify({ id, type, ...extra }) });
  const first = api.localApiFetch('http://127.0.0.1:7860/v1/models', { headers: { Authorization: 'Bearer test-only' } });
  const id = sent[0].id;
  assert.equal(sent[0].url, 'http://127.0.0.1:7860/v1/models');
  emit(id, 'headers', { status: 200, contentType: 'application/json' });
  const response = await first;
  const output = response.text();
  await wait();
  const bytes = Buffer.from('{"回复":"你好"}');
  emit(id, 'chunk', { data: bytes.subarray(0, 12).toString('base64') });
  await wait();
  emit(id, 'chunk', { data: bytes.subarray(12).toString('base64') });
  await wait(); emit(id, 'end');
  assert.equal(await output, '{"回复":"你好"}');
  const cancel = new AbortController();
  const pending = api.localApiFetch('http://localhost:7860/v1/chat/completions', { method: 'POST', body: '{}', signal: cancel.signal });
  const id2 = sent.at(-1).id; cancel.abort();
  await assert.rejects(pending, e => e.name === 'AbortError');
  assert.ok(sent.some(m => m.id === id2 && m.type === 'cancel'));
  const streamingAbort = new AbortController();
  const streaming = api.localApiFetch('http://localhost:7860/v1/chat/completions', { signal: streamingAbort.signal });
  const id3 = sent.at(-1).id; emit(id3, 'headers', { status: 401 });
  const denied = await streaming; assert.equal(denied.status, 401); assert.equal(denied.ok, false);
  const read = denied.text(); streamingAbort.abort();
  await assert.rejects(read, e => e.name === 'AbortError');
  await assert.rejects(load({ AndroidShell: {} }).localApiFetch('http://127.0.0.1:7860/v1/models'), /APK/);
  let remoteCalls = 0;
  const direct = load({}, async () => { remoteCalls++; return new Response('remote'); });
  assert.equal(await (await direct.localApiFetch('https://api.example.test/v1/models')).text(), 'remote');
  assert.equal(remoteCalls, 1);
  await assert.rejects(load({}, async () => { throw new TypeError('Failed to fetch'); }).localApiFetch('http://127.0.0.1:7860/v1/models'), /跨域/);
  console.log('PASS local API: routing, IPv4/IPv6, UTF-8 streaming, HTTP status, abort before/after headers, old APK and browser diagnostics');
})().catch(error => { console.error(error); process.exitCode = 1; });
