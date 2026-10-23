import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
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
const unicodeTables = fs.readdirSync('node_modules/regenerate-unicode-properties',{recursive:true}).filter(p=>p.includes('/')&&p.endsWith('.js'));
const regexDataPlugin = {name:'mobile-unicode-tables',setup(build){build.onLoad({filter:/regexpu-core[/\\]rewrite-pattern\.js$/},args=>({loader:'js',contents:fs.readFileSync(args.path,'utf8').replace('return require(`regenerate-unicode-properties/${ path }.js`);','switch(path){'+unicodeTables.map(p=>'case '+JSON.stringify(p.slice(0,-3))+':return require('+JSON.stringify('regenerate-unicode-properties/'+p)+');').join('')+'default:throw new Error("Unknown Unicode property");}')}));}};
await build({plugins:[regexDataPlugin],entryPoints:['scripts/phone-runtime-compat.cjs'],outfile:path.join(output,'phone-runtime-compat.cjs'),bundle:true,platform:'node',target:'node18',external:['./phone-intl.cjs']});
await build({entryPoints:['scripts/phone-intl.mjs'],outfile:path.join(output,'phone-intl.cjs'),bundle:true,platform:'node',target:'node18'});
// Lower literal expressions in polyfills too; dynamic expressions use the runtime adapter.
const compatDir = path.join(output,'.compat');
fs.mkdirSync(compatDir,{recursive:true});
for (const name of ['phone-runtime-compat.cjs','phone-intl.cjs']) fs.renameSync(path.join(output,name),path.join(compatDir,name));
await makeMobileRegexCompatible(compatDir);
for (const name of ['phone-runtime-compat.cjs','phone-intl.cjs']) fs.renameSync(path.join(compatDir,name),path.join(output,name));
fs.rmdirSync(compatDir);
await makeMobileRegexCompatible(path.join(output,'node_modules'));
await makeMobileRegexCompatible(path.join(output,'.next/server'));
const assets = 'android-shell/app/src/main/assets';
fs.mkdirSync(assets,{recursive:true});
fs.rmSync(path.join(root,assets,'phone-server.zip'),{force:true});
execFileSync('zip',['-qr',path.join(root,assets,'phone-server.zip'),'.'],{cwd:output});
console.log(`Bundled local server: ${fs.statSync(path.join(assets,'phone-server.zip')).size} bytes`);
