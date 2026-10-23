import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformAsync } from '@babel/core';
import unicodePropertyRegex from '@babel/plugin-transform-unicode-property-regex';
import rewritePattern from 'regexpu-core';
const require = createRequire(import.meta.url);

// Node Mobile has no ICU property tables. Preserve Unicode semantics by emitting
// explicit ranges at build time; never replace Chinese/emoji matching with ASCII.
function patternConstants() {
  const isConstructor = p => p && (p.isNewExpression() || p.isCallExpression()) &&
    p.node.callee.type === 'Identifier' && p.node.callee.name === 'RegExp';
  const isPattern = p => {
    if (isConstructor(p.parentPath) && p.parentPath.node.arguments[0] === p.node) return true;
    const decl = p.parentPath;
    if (!decl?.isVariableDeclarator() || decl.node.id.type !== 'Identifier') return false;
    const binding = decl.scope.getBinding(decl.node.id.name);
    return binding?.referencePaths.some(ref => isConstructor(ref.parentPath) && ref.parentPath.node.arguments[0] === ref.node);
  };
  return { visitor: {
    StringLiteral(p) {
      if (!/\\[pP]\{/.test(p.node.value) || !isPattern(p)) return;
      p.node.value = rewritePattern(p.node.value, 'u', {unicodePropertyEscapes:'transform'});
    },
    TemplateLiteral(p) {
      if (p.node.expressions.length || !isPattern(p)) return;
      const value = p.node.quasis[0].value.cooked;
      if (typeof value !== 'string' || !/\\[pP]\{/.test(value)) return;
      const next = rewritePattern(value, 'u', {unicodePropertyEscapes:'transform'});
      p.replaceWith({type:'StringLiteral',value:next});
    }
  }};
}
const options = {babelrc:false,configFile:false,sourceType:'unambiguous',compact:true,
  comments:false, plugins:[patternConstants,[unicodePropertyRegex,{useUnicodeFlag:true}]]};
export async function makeMobileRegexCompatible(directory) {
  let changed = 0;
  async function visit(folder) {
    for (const entry of await fs.readdir(folder,{withFileTypes:true})) {
      const file = path.join(folder,entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!/\.(?:cjs|mjs|js)$/.test(entry.name)) continue;
      const text = await fs.readFile(file,'utf8');
      if (!/\\[pP]\{/.test(text)) continue;
      let code;
      if (entry.name.endsWith('.js.text.js')) {
        const embedded = require(file);
        code = `module.exports=${JSON.stringify((await transformAsync(embedded,options)).code)};`;
      } else code = (await transformAsync(text,options)).code;
      await fs.writeFile(file,code);
      changed++;
    }
  }
  await visit(directory);
  console.log(`Converted Unicode regex in ${changed} local server modules`);
}
