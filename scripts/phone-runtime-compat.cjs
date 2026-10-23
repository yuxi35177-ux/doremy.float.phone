// Install before loading Next: the embedded Node build intentionally omits ICU.
const rewrite = require('regexpu-core');
const NativeRegExp = globalThis.RegExp;
function MobileRegExp(pattern, flags) {
  const source = pattern instanceof NativeRegExp ? pattern.source : String(pattern ?? '');
  const actualFlags = flags ?? (pattern instanceof NativeRegExp ? pattern.flags : '');
  if (/\\[pP]\{/.test(source)) {
    const converted = rewrite(source, actualFlags, {unicodePropertyEscapes:'transform',unicodeSetsFlag:'transform',unicodeFlag:'transform'});
    return new NativeRegExp(converted, actualFlags.replace(/[uv]/g, ''));
  }
  if (!new.target && pattern instanceof NativeRegExp && flags === undefined) return pattern;
  return new NativeRegExp(pattern, flags);
}
Object.setPrototypeOf(MobileRegExp, NativeRegExp);
MobileRegExp.prototype = NativeRegExp.prototype;
globalThis.RegExp = MobileRegExp;
try { new globalThis.TextDecoder('utf-8', {fatal:true}); }
catch (_) {
  const BaseDecoder = require('@cto.af/textdecoder/polyfill.js');
  class Decoder extends BaseDecoder { decode(input = new Uint8Array(), options) { return super.decode(input, options); } }
  globalThis.TextDecoder = Decoder;
  require('node:util').TextDecoder = Decoder;
}
require('./phone-intl.cjs');
