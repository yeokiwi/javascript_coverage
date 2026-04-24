#!/usr/bin/env node
'use strict';

/**
 * Minimal self-contained test suite. No external runner — we don't want to
 * pull mocha/jest in as a dev dep. Each test is a function; a failing
 * assertion throws.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { instrument } = require('../src/instrument');
const { analyzeMcdc } = require('../src/coverage/mcdc');
const { summarize } = require('../src/coverage/summary');
const { reportText } = require('../src/reporter/text');
const { renderHtml } = require('../src/reporter/html');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function runInstrumented(source, filename) {
  const { code } = instrument(source, filename);
  const ctx = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    globalThis: {},
  };
  ctx.global = ctx.globalThis;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename });
  return { exports: ctx.module.exports, coverage: ctx.globalThis.__coverage__ || {} };
}

test('instruments a basic if / && / || decision and records MC/DC atoms', () => {
  const src = `
    function f(a, b, c) {
      if ((a && b) || c) return 1;
      return 0;
    }
    module.exports = { f };
  `;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/basic.js');
  mod.f(true, true, false);
  mod.f(false, true, false);
  mod.f(true, false, false);
  mod.f(true, false, true);
  const fe = coverage['/virtual/basic.js'];
  assert.ok(fe, 'file entry');
  const dec = fe.mcdcMap[0];
  assert.strictEqual(dec.atomCount, 3);
  const obs = Object.values(fe.mcdc[0].observations);
  assert.ok(obs.length >= 3, `expected >=3 unique observations, got ${obs.length}`);
  // classic must reach 3/3
  const classic = analyzeMcdc(3, fe.mcdc[0].observations, 'classic');
  assert.strictEqual(classic.covered, 3, 'classic should cover all 3 atoms');
});

test('ternary test expression is instrumented as its own decision', () => {
  const src = `
    function g(x) { return x > 0 ? 'pos' : 'neg'; }
    module.exports = { g };
  `;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/tern.js');
  mod.g(1); mod.g(-1);
  const fe = coverage['/virtual/tern.js'];
  assert.strictEqual(Object.keys(fe.mcdcMap).length, 1);
  assert.strictEqual(fe.mcdcMap[0].atomCount, 1);
});

test('while-loop test is instrumented', () => {
  const src = `
    function h(n) {
      let s = 0, i = 0;
      while (i < n && n > 0) { s += i; i++; }
      return s;
    }
    module.exports = { h };
  `;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/while.js');
  mod.h(3); mod.h(0); mod.h(-1);
  const fe = coverage['/virtual/while.js'];
  assert.ok(fe.mcdcMap[0], 'while decision recorded');
  assert.strictEqual(fe.mcdcMap[0].atomCount, 2);
});

test('short-circuit leaves un-evaluated atom as null (X)', () => {
  const src = `
    function f(a, b) { if (a || b) return 1; return 0; }
    module.exports = { f };
  `;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/sc.js');
  mod.f(true, false); // short-circuits, b should be null
  const fe = coverage['/virtual/sc.js'];
  const obs = Object.values(fe.mcdc[0].observations)[0];
  assert.strictEqual(obs.conditions[0], true);
  assert.strictEqual(obs.conditions[1], null, 'short-circuited atom must be null');
});

test('unique-cause is stricter than classic', () => {
  const src = `
    function f(a, b, c) { if ((a && b) || c) return 1; return 0; }
    module.exports = { f };
  `;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/uc.js');
  // Full 2^3 truth table to give both methods the best chance.
  for (const a of [false, true])
    for (const b of [false, true])
      for (const c of [false, true])
        mod.f(a, b, c);
  const fe = coverage['/virtual/uc.js'];
  const obs = fe.mcdc[0].observations;
  const classic = analyzeMcdc(3, obs, 'classic').covered;
  const unique = analyzeMcdc(3, obs, 'unique').covered;
  assert.strictEqual(classic, 3);
  assert.ok(unique <= classic, 'unique ≤ classic');
});

test('summarize produces consistent totals', () => {
  const src = `function f(x){ if(x>0) return 1; return 0; } module.exports = {f};`;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/sum.js');
  mod.f(1); mod.f(-1);
  const s = summarize(coverage);
  assert.strictEqual(s.totals.statements.pct, 100);
  assert.strictEqual(s.totals.decisions.pct, 100);
  assert.strictEqual(s.totals.mcdc.classic.pct, 100);
});

test('TypeScript types are stripped, MC/DC still recorded', () => {
  const src = `
    function f(x: number | null): string {
      if (x !== null && x > 0) return 'pos';
      return 'none';
    }
    module.exports = { f };
  `;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/ts.ts');
  mod.f(1); mod.f(-1); mod.f(null);
  const fe = coverage['/virtual/ts.ts'];
  assert.ok(fe, 'ts file instrumented');
  assert.strictEqual(fe.mcdcMap[0].atomCount, 2);
});

test('JSX expressions do not crash the MC/DC pass', () => {
  const src = `
    function F(p) {
      const x = p.n > 0 ? <div>{p.n}</div> : <span>neg</span>;
      return x;
    }
    module.exports = { F };
  `;
  // Need a createElement stub.
  const { code } = instrument(src, '/virtual/j.jsx');
  const ctx = {
    module: { exports: {} },
    exports: {},
    globalThis: {},
    React: { createElement: (t, p, ...c) => ({ t, p, c }) },
  };
  ctx.global = ctx.globalThis;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: '/virtual/j.jsx' });
  ctx.module.exports.F({ n: 1 });
  ctx.module.exports.F({ n: -1 });
  const fe = ctx.globalThis.__coverage__['/virtual/j.jsx'];
  assert.strictEqual(fe.mcdcMap[0].atomCount, 1);
});

test('text and html reports render without throwing', () => {
  const src = `
    function f(a,b,c){ if ((a&&b)||c) return 1; return 0; }
    module.exports = {f};
  `;
  const { exports: mod, coverage } = runInstrumented(src, '/virtual/rep.js');
  mod.f(true, true, false); mod.f(false, false, true); mod.f(false, false, false);
  const s = summarize(coverage);
  const txt = reportText(s, { verbose: true });
  assert.ok(txt.includes('MC/DC'));
  const html = renderHtml(s);
  assert.ok(html.includes('<!doctype html>'));
  assert.ok(html.includes('MC/DC (classic)'));
});

// --- runner ---
let passed = 0, failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log('  ✓', t.name);
    passed++;
  } catch (err) {
    console.error('  ✗', t.name);
    console.error('     ', err.stack || err.message);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
