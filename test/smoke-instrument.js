const fs = require('fs');
const path = require('path');
const { instrument } = require('../src/instrument');

const fixture = path.resolve(__dirname, 'fixtures/sample.js');
const src = fs.readFileSync(fixture, 'utf8');
const { code } = instrument(src, fixture);
console.log('=== INSTRUMENTED CODE ===');
console.log(code.slice(0, 4000));
console.log('=== LENGTH ===', code.length);

// Evaluate it and exercise it.
const vm = require('vm');
const ctx = { module: { exports: {} }, exports: {}, require, globalThis: {} };
ctx.global = ctx.globalThis;
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: fixture });

const mod = ctx.module.exports;
mod.classify(true, true, false);
mod.classify(false, true, true);
mod.classify(true, false, false);
mod.pick(5);
mod.pick(-1);

console.log('=== COVERAGE KEYS ===');
const cov = ctx.globalThis.__coverage__;
console.log(Object.keys(cov));
for (const k of Object.keys(cov)) {
  const fe = cov[k];
  console.log('file:', k);
  console.log('  mcdcMap decisions:', Object.keys(fe.mcdcMap || {}).length);
  for (const [id, meta] of Object.entries(fe.mcdcMap || {})) {
    console.log('    dec', id, 'kind=', meta.kind, 'atoms=', meta.atomCount);
    const obs = (fe.mcdc || {})[id]?.observations || {};
    for (const [key, o] of Object.entries(obs)) {
      console.log('      obs', key, '→', JSON.stringify(o));
    }
  }
}
