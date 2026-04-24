'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  // Execution mode: 'script' (require an entry file in-process) or 'command'
  // (spawn an external test runner like mocha).
  mode: 'script',

  // For script mode: entry file path (relative to root).
  entry: null,

  // For command mode: command + args (e.g. { command: 'mocha', args: ['test/**/*.js'] }).
  command: null,
  args: [],

  // Source filter (glob patterns relative to root).
  include: null,
  exclude: ['node_modules/**', 'coverage/**', '.cov-cache/**'],

  // Root directory (sources outside of root are not instrumented).
  root: process.cwd(),

  // Enable/disable MC/DC instrumentation.
  mcdc: true,

  // Reporters to emit: any of 'text', 'json', 'html'.
  reporters: ['text'],

  // Output directory for json/html reports.
  outputDir: 'coverage',

  // Coverage data global name.
  coverageVariable: '__coverage__',

  // Verbose text reporter (per-decision MC/DC details).
  verbose: false,
};

function loadConfigFile(cwd) {
  const candidates = [
    'jscov.config.js',
    'jscov.config.cjs',
    'jscov.config.json',
  ];
  for (const name of candidates) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      if (name.endsWith('.json')) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
      return require(p);
    }
  }
  return {};
}

function resolveConfig(cliConfig = {}, cwd = process.cwd()) {
  const fileConfig = loadConfigFile(cwd);
  const merged = Object.assign({}, DEFAULT_CONFIG, fileConfig, cliConfig);
  merged.root = path.resolve(cwd, merged.root || '.');
  if (merged.entry) merged.entry = path.resolve(merged.root, merged.entry);
  if (merged.outputDir)
    merged.outputDir = path.resolve(merged.root, merged.outputDir);
  return merged;
}

module.exports = { resolveConfig, DEFAULT_CONFIG };
