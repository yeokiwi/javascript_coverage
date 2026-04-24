'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');
const { instrument } = require('../instrument');

const SUPPORTED = ['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs'];

let installed = false;
let originalCompile;
let filterFn = () => true;

function shouldInstrument(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  if (!SUPPORTED.includes(ext)) return false;
  if (filename.includes(`${path.sep}node_modules${path.sep}`)) return false;
  return filterFn(filename);
}

/**
 * Install a require hook that instruments supported source files on load.
 *
 * @param {object} [opts]
 * @param {(file: string) => boolean} [opts.filter] - additional filter beyond
 *        default extensions/node_modules exclusion.
 * @param {string} [opts.coverageVariable]
 * @param {boolean} [opts.mcdc]
 */
function install(opts = {}) {
  if (installed) return;
  installed = true;

  if (typeof opts.filter === 'function') filterFn = opts.filter;

  originalCompile = Module.prototype._compile;
  const compileOpts = {
    coverageVariable: opts.coverageVariable,
    mcdc: opts.mcdc,
  };

  // Teach the Node require system to accept our extra extensions.
  for (const ext of SUPPORTED) {
    if (!require.extensions[ext]) {
      require.extensions[ext] = require.extensions['.js'];
    }
  }

  Module.prototype._compile = function jscovCompile(source, filename) {
    if (!shouldInstrument(filename)) {
      return originalCompile.call(this, source, filename);
    }
    let instrumented;
    try {
      instrumented = instrument(source, filename, compileOpts).code;
    } catch (err) {
      // Fall back to original source on instrumentation failure, but surface it.
      process.emitWarning(
        `jscov: failed to instrument ${filename}: ${err.message}`,
        'JscovInstrumentError'
      );
      return originalCompile.call(this, source, filename);
    }
    return originalCompile.call(this, instrumented, filename);
  };
}

function uninstall() {
  if (!installed) return;
  Module.prototype._compile = originalCompile;
  installed = false;
}

/**
 * Write the current global coverage object to a file (JSON).
 */
function dumpCoverage(outputPath, coverageVariable = '__coverage__') {
  const cov = globalThis[coverageVariable];
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cov || {}));
}

module.exports = { install, uninstall, dumpCoverage, shouldInstrument };
