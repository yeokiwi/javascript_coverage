'use strict';

const path = require('path');
const babel = require('@babel/core');
const mcdcPlugin = require('./mcdc-plugin');

const TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JSX_EXTS = new Set(['.jsx', '.tsx']);

/**
 * Instrument a single source file for statement, branch, and MC/DC coverage.
 *
 * @param {string} source   Source code.
 * @param {string} filename Absolute path; used as the coverage key and for
 *                          picking Babel presets based on extension.
 * @param {object} [opts]
 * @param {string} [opts.coverageVariable='__coverage__']
 * @param {boolean} [opts.mcdc=true]  Run the MC/DC pass (can be disabled for
 *                                    plain statement/branch coverage only).
 * @returns {{ code: string, map: object | null }}
 */
function instrument(source, filename, opts = {}) {
  const coverageVariable = opts.coverageVariable || '__coverage__';
  const enableMcdc = opts.mcdc !== false;
  const ext = path.extname(filename).toLowerCase();

  const presets = [];
  if (TS_EXTS.has(ext)) {
    presets.push([
      require.resolve('@babel/preset-typescript'),
      { allExtensions: true, isTSX: ext === '.tsx' },
    ]);
  }
  if (JSX_EXTS.has(ext) || ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    presets.push([
      require.resolve('@babel/preset-react'),
      { runtime: 'classic' },
    ]);
  }

  const plugins = [];
  if (enableMcdc) plugins.push(mcdcPlugin);
  plugins.push([
    require.resolve('babel-plugin-istanbul'),
    {
      coverageVariable,
      extension: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'],
      include: opts.include,
      exclude: opts.exclude !== undefined ? opts.exclude : [],
      excludeNodeModules: opts.excludeNodeModules !== false,
    },
  ]);

  const result = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    sourceFileName: filename,
    compact: false,
    comments: true,
    presets,
    plugins,
    parserOpts: {
      allowReturnOutsideFunction: true,
      plugins: ['importAssertions', 'decorators-legacy', 'classProperties'],
    },
  });

  if (!result || result.code == null) {
    throw new Error(`jscov: failed to instrument ${filename}`);
  }
  return { code: result.code, map: result.map || null };
}

module.exports = { instrument };
