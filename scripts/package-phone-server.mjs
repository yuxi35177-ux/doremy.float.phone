import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeMobileRegexCompatible } from './phone-regex-compat.mjs';
const root = process.cwd();
const output = path.join(root, '.phone-server');
fs.rmSync(output, {recursive:true, force:true});
fs.cpSync('.next/standalone', output, {recursive:true, dereference:true, filter: p =>
  !/[/\\](?:\.env(?:\.[^/\\]+)?|\.git|android-shell)(?:[/\\]|$)/.test(p)});
fs.cpSync('.next/static', path.join(output,'.next/static'), {recursive:true});
fs.cpSync('public', path.join(output,'public'), {recursive:true});
fs.copyFileSync('scripts/phone-bootstrap.cjs', path.join(output,'phone-bootstrap.cjs'));
// Fail rather than silently ship an online shell or omit a settings screen.
for (const p of ['server.js','.next/server/app/index.html','public/icon-192.png']) {
  if (!fs.existsSync(path.join(output,p))) throw new Error(`Missing local bundle file: ${p}`);
}
await makeMobileRegexCompatible(path.join(output,'node_modules'));
await makeMobileRegexCompatible(path.join(output,'.next/server'));
const assets = 'android-shell/app/src/main/assets';
fs.mkdirSync(assets,{recursive:true});
fs.rmSync(path.join(root,assets,'phone-server.zip'),{force:true});
execFileSync('zip',['-qr',path.join(root,assets,'phone-server.zip'),'.'],{cwd:output});
console.log(`Bundled local server: ${fs.statSync(path.join(assets,'phone-server.zip')).size} bytes`);
