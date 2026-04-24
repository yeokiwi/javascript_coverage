'use strict';

/**
 * Babel plugin that adds MC/DC instrumentation to JavaScript/TypeScript/JSX.
 *
 * For each decision (the test of if/while/do-while/for, and ternary
 * ConditionalExpression.test) we:
 *   1. Walk through &&, ||, ??, ! transparently and collect the atomic
 *      sub-conditions (the leaves).
 *   2. Replace each atom C with __jscov_c__(FID, decId, atomIdx, C) — records the
 *      runtime truth value for that atom, returns C unchanged.
 *   3. Replace the whole decision EXPR with
 *        (__jscov_rd__(FID, decId), __jscov_rec__(FID, decId, EXPR'))
 *      — reset the atom vector first via the comma operator, then evaluate EXPR'
 *      (which fills the vector via __jscov_c__), then commit the observation.
 *
 * A prelude emitted at the top of each instrumented file installs the helpers
 * (idempotently) on globalThis, registers the file's MC/DC metadata on
 * global.__coverage__[filename], and declares a file-scoped var __jscovFID__
 * that every wrapped call uses.
 */

const babelParser = require('@babel/parser');
const MARKER = '__jscovFID__';

function isLogicalConnective(node) {
  return (
    node.type === 'LogicalExpression' &&
    (node.operator === '&&' || node.operator === '||' || node.operator === '??')
  );
}

function isNot(node) {
  return node.type === 'UnaryExpression' && node.operator === '!';
}

module.exports = function mcdcPlugin({ types: t }) {
  const fidIdentifier = () => t.identifier(MARKER);

  function helper(name) {
    return t.memberExpression(t.identifier('globalThis'), t.identifier(name));
  }

  function buildAtomCall(decId, atomIdx, expr) {
    return t.callExpression(helper('__jscov_c__'), [
      fidIdentifier(),
      t.numericLiteral(decId),
      t.numericLiteral(atomIdx),
      expr,
    ]);
  }

  function buildResetCall(decId) {
    return t.callExpression(helper('__jscov_rd__'), [
      fidIdentifier(),
      t.numericLiteral(decId),
    ]);
  }

  function buildRecCall(decId, expr) {
    return t.callExpression(helper('__jscov_rec__'), [
      fidIdentifier(),
      t.numericLiteral(decId),
      expr,
    ]);
  }

  function transformAtoms(node, decId, atoms) {
    if (isLogicalConnective(node)) {
      node.left = transformAtoms(node.left, decId, atoms);
      node.right = transformAtoms(node.right, decId, atoms);
      return node;
    }
    if (isNot(node)) {
      node.argument = transformAtoms(node.argument, decId, atoms);
      return node;
    }
    const atomIdx = atoms.length;
    atoms.push({
      loc: node.loc
        ? {
            start: { line: node.loc.start.line, column: node.loc.start.column },
            end: { line: node.loc.end.line, column: node.loc.end.column },
          }
        : null,
    });
    return buildAtomCall(decId, atomIdx, node);
  }

  function wrapDecision(path, field, pluginState) {
    const expr = path.node[field];
    if (!expr) return;
    if (expr.__jscovVisited) return;

    const decId = pluginState.decisions.length;
    const atoms = [];
    const transformed = transformAtoms(expr, decId, atoms);
    const wrapped = t.sequenceExpression([
      buildResetCall(decId),
      buildRecCall(decId, transformed),
    ]);
    wrapped.__jscovVisited = true;

    pluginState.decisions.push({
      loc: expr.loc
        ? {
            start: { line: expr.loc.start.line, column: expr.loc.start.column },
            end: { line: expr.loc.end.line, column: expr.loc.end.column },
          }
        : null,
      kind: path.node.type,
      atomCount: atoms.length,
      atoms,
    });

    path.node[field] = wrapped;
  }

  function buildPrelude(filename, decisions) {
    const metaJson = JSON.stringify({ filename, decisions });
    const src = `
      (function(){
        var g = (typeof globalThis !== 'undefined') ? globalThis
              : (typeof global !== 'undefined') ? global
              : (typeof window !== 'undefined') ? window
              : this;
        if (!g.__coverage__) g.__coverage__ = {};
        var __meta = ${metaJson};
        var fe = g.__coverage__[__meta.filename] || (g.__coverage__[__meta.filename] = {});
        fe.path = __meta.filename;
        if (!fe.mcdcMap) fe.mcdcMap = {};
        if (!fe.mcdc) fe.mcdc = {};
        for (var i = 0; i < __meta.decisions.length; i++) {
          fe.mcdcMap[i] = __meta.decisions[i];
          if (!fe.mcdc[i]) fe.mcdc[i] = { observations: {} };
        }
        if (!g.__jscov_files__) g.__jscov_files__ = {};
        if (!g.__jscov_files__[__meta.filename]) {
          g.__jscov_files__[__meta.filename] = { id: __meta.filename, cur: {} };
        }
        if (!g.__jscov_c__) {
          g.__jscov_c__ = function(fid, dec, idx, val) {
            var cur = fid.cur[dec];
            if (!cur) { cur = fid.cur[dec] = []; }
            cur[idx] = !!val;
            return val;
          };
          g.__jscov_rd__ = function(fid, dec) {
            var meta = g.__coverage__[fid.id].mcdcMap[dec];
            var cnt = meta.atomCount;
            var arr = new Array(cnt);
            for (var i = 0; i < cnt; i++) arr[i] = null;
            fid.cur[dec] = arr;
          };
          g.__jscov_rec__ = function(fid, dec, outcome) {
            var cur = fid.cur[dec] || [];
            var meta = g.__coverage__[fid.id].mcdcMap[dec];
            var cnt = meta.atomCount;
            var key = '';
            for (var i = 0; i < cnt; i++) {
              var v = cur[i];
              key += (v === true ? '1' : v === false ? '0' : 'X');
            }
            key += '|' + (outcome ? '1' : '0');
            var obs = g.__coverage__[fid.id].mcdc[dec].observations;
            if (!obs[key]) {
              var conds = new Array(cnt);
              for (var j = 0; j < cnt; j++) {
                conds[j] = cur[j] === undefined ? null : cur[j];
              }
              obs[key] = { conditions: conds, outcome: !!outcome, count: 0 };
            }
            obs[key].count++;
            return outcome;
          };
        }
      })();
    `;
    const ast = babelParser.parse(src, { sourceType: 'script' });
    return ast.program.body;
  }

  function buildFidDecl() {
    return t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier(MARKER),
        t.memberExpression(
          t.memberExpression(
            t.identifier('globalThis'),
            t.identifier('__jscov_files__')
          ),
          // filename is inserted later via replacement; we use a placeholder here
          t.stringLiteral('__JSCOV_FILENAME_PLACEHOLDER__'),
          true
        )
      ),
    ]);
  }

  return {
    name: 'jscov-mcdc',
    pre() {
      this.__jscov = { decisions: [] };
    },
    visitor: {
      IfStatement(path) {
        wrapDecision(path, 'test', this.__jscov);
      },
      WhileStatement(path) {
        wrapDecision(path, 'test', this.__jscov);
      },
      DoWhileStatement(path) {
        wrapDecision(path, 'test', this.__jscov);
      },
      ForStatement(path) {
        if (path.node.test) wrapDecision(path, 'test', this.__jscov);
      },
      ConditionalExpression(path) {
        wrapDecision(path, 'test', this.__jscov);
      },
      Program: {
        exit(programPath, state) {
          const filename =
            (state.file && state.file.opts && state.file.opts.filename) ||
            '<anonymous>';
          const decisions = this.__jscov.decisions;

          const preludeBody = buildPrelude(filename, decisions);

          const fidDecl = t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier(MARKER),
              t.memberExpression(
                t.memberExpression(
                  t.identifier('globalThis'),
                  t.identifier('__jscov_files__')
                ),
                t.stringLiteral(filename),
                true
              )
            ),
          ]);

          programPath.node.body.unshift(fidDecl);
          for (let i = preludeBody.length - 1; i >= 0; i--) {
            programPath.node.body.unshift(preludeBody[i]);
          }
        },
      },
    },
  };
};
