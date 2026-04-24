'use strict';

/**
 * Preload script used when running tests under an external runner (mocha,
 * jest's node-runner-compatible projects, plain node, etc.) via
 * NODE_OPTIONS=--require=<path to this file>.
 *
 * Reads configuration from environment variables:
 *   JSCOV_OUTPUT       - Path where the subprocess should write coverage on exit.
 *   JSCOV_ROOT         - Project root; sources under it are instrumented.
 *   JSCOV_INCLUDE      - Comma-separated glob patterns for inclusion.
 *   JSCOV_EXCLUDE      - Comma-separated glob patterns for exclusion.
 *   JSCOV_COVERAGE_VAR - Global coverage variable name (default __coverage__).
 *   JSCOV_MCDC         - "0" to disable MC/DC; default on.
 */

const path = require('path');
const { install, dumpCoverage } = require('./hook');

function parseList(s) {
  if (!s) return null;
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function globToRegExp(glob) {
  // Simple glob: ** matches anything incl /, * matches any non-/.
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLESTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*');
  return new RegExp('^' + re + '$');
}

const root = process.env.JSCOV_ROOT || process.cwd();
const include = parseList(process.env.JSCOV_INCLUDE);
const exclude = parseList(process.env.JSCOV_EXCLUDE);
const includeRes = include ? include.map(globToRegExp) : null;
const excludeRes = exclude ? exclude.map(globToRegExp) : [];

function filter(file) {
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const posixRel = rel.split(path.sep).join('/');
  for (const re of excludeRes) {
    if (re.test(posixRel)) return false;
  }
  if (includeRes) {
    for (const re of includeRes) {
      if (re.test(posixRel)) return true;
    }
    return false;
  }
  return true;
}

install({
  filter,
  coverageVariable: process.env.JSCOV_COVERAGE_VAR || '__coverage__',
  mcdc: process.env.JSCOV_MCDC !== '0',
});

const outputPath = process.env.JSCOV_OUTPUT;
if (outputPath) {
  const write = () =>
    dumpCoverage(outputPath, process.env.JSCOV_COVERAGE_VAR || '__coverage__');
  process.on('exit', write);
  // Also write on signal so we don't lose coverage on SIGTERM.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      write();
      process.exit(128);
    });
  }
}
