'use strict';

/**
 * Two modes of running instrumented code:
 *   - runScript: require a JS entry point in-process (supports CommonJS).
 *   - runCommand: spawn an external command (e.g. "mocha") with NODE_OPTIONS
 *     set to preload our hook, and collect coverage from a file the child
 *     writes on exit.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const { install, dumpCoverage } = require('./hook');

function buildFilter(root, include, exclude) {
  const toRe = (glob) => {
    const re = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '::D::')
      .replace(/\*/g, '[^/]*')
      .replace(/::D::/g, '.*');
    return new RegExp('^' + re + '$');
  };
  const incRe = include && include.length ? include.map(toRe) : null;
  const excRe = (exclude || []).map(toRe);
  return (file) => {
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const posix = rel.split(path.sep).join('/');
    for (const re of excRe) if (re.test(posix)) return false;
    if (incRe) {
      for (const re of incRe) if (re.test(posix)) return true;
      return false;
    }
    return true;
  };
}

/**
 * In-process script run. Installs the require hook, requires `entry`, and
 * returns the accumulated coverage. If the entry exports a function, it is
 * invoked (useful for small programs with an explicit main()).
 */
async function runScript({
  entry,
  root = process.cwd(),
  include,
  exclude,
  mcdc = true,
  coverageVariable = '__coverage__',
  args = [],
}) {
  install({
    filter: buildFilter(root, include, exclude),
    coverageVariable,
    mcdc,
  });
  const absEntry = path.resolve(root, entry);
  // Pass args to the program via process.argv trimming — keep it simple: just
  // let the program read process.argv; we don't rewrite.
  const exported = require(absEntry);
  if (typeof exported === 'function') await exported(...args);
  else if (exported && typeof exported.default === 'function')
    await exported.default(...args);
  else if (exported && typeof exported.main === 'function')
    await exported.main(...args);
  return globalThis[coverageVariable] || {};
}

/**
 * Spawn an external command under our preload hook. Returns the parsed
 * coverage object the child wrote to disk and the exit code.
 */
function runCommand({
  command,
  args = [],
  root = process.cwd(),
  include,
  exclude,
  mcdc = true,
  coverageVariable = '__coverage__',
  env = process.env,
  stdio = 'inherit',
}) {
  return new Promise((resolve, reject) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jscov-'));
    const outFile = path.join(outDir, 'coverage.json');
    const preloadPath = require.resolve('./preload.js');

    const childEnv = Object.assign({}, env, {
      JSCOV_OUTPUT: outFile,
      JSCOV_ROOT: root,
      JSCOV_INCLUDE: (include || []).join(','),
      JSCOV_EXCLUDE: (exclude || []).join(','),
      JSCOV_COVERAGE_VAR: coverageVariable,
      JSCOV_MCDC: mcdc ? '1' : '0',
      NODE_OPTIONS: `${env.NODE_OPTIONS ? env.NODE_OPTIONS + ' ' : ''}--require=${preloadPath}`,
    });

    const child = spawn(command, args, {
      cwd: root,
      env: childEnv,
      stdio,
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      let coverage = {};
      try {
        if (fs.existsSync(outFile)) {
          coverage = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        }
      } catch (err) {
        return reject(err);
      } finally {
        try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) {}
      }
      resolve({ coverage, code, signal });
    });
  });
}

module.exports = { runScript, runCommand, dumpCoverage };
