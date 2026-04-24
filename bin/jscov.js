#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConfig } = require('../src/config');
const { runScript, runCommand } = require('../src/runner/run');
const { summarize } = require('../src/coverage/summary');
const { reportText } = require('../src/reporter/text');
const { reportJson } = require('../src/reporter/json');
const { writeHtml } = require('../src/reporter/html');

// Flags that accept a value as the next argv token (space-separated form).
// All other flags are boolean unless given as --name=value.
const VALUE_FLAGS = new Set([
  'config',
  'root',
  'include',
  'exclude',
  'reporters',
  'output',
  'input',
]);

function parseArgs(argv) {
  const out = { _: [], flags: {}, passthrough: [] };
  let i = 0;
  let seenDashDash = false;
  while (i < argv.length) {
    const a = argv[i];
    if (seenDashDash) {
      out.passthrough.push(a);
      i++;
      continue;
    }
    if (a === '--') { seenDashDash = true; i++; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const name = a.slice(2);
        const next = argv[i + 1];
        if (VALUE_FLAGS.has(name) && next !== undefined && !next.startsWith('-')) {
          out.flags[name] = next;
          i++;
        } else {
          out.flags[name] = true;
        }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      const name = a.slice(1);
      const next = argv[i + 1];
      if (VALUE_FLAGS.has(name) && next !== undefined && !next.startsWith('-')) {
        out.flags[name] = next;
        i++;
      } else {
        out.flags[name] = true;
      }
    } else {
      out._.push(a);
    }
    i++;
  }
  return out;
}

function splitList(v) {
  if (v == null || v === true) return undefined;
  if (Array.isArray(v)) return v;
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

const USAGE = `
jscov — statement, decision, and MC/DC coverage for JS/TS/JSX

USAGE
  jscov run [--config=path] [--include=glob,...] [--exclude=glob,...]
            [--reporters=text,json,html] [--output=dir] [--no-mcdc] [--verbose]
            <entry.js> [-- <args for entry>]

  jscov test [--config=path] [--include=...] [--exclude=...] [--reporters=...]
             [--output=...] [--no-mcdc] [--verbose]
             -- <command> [args...]

  jscov report --input=coverage.json [--reporters=text,json,html] [--output=dir]

  jscov instrument <file.js>      # print instrumented source to stdout

OPTIONS
  --config=<path>    Path to jscov.config.(js|cjs|json). Default: auto-discover.
  --root=<dir>       Project root used for include/exclude matching.
  --include=<glob>   Instrument only files matching these comma-separated globs.
  --exclude=<glob>   Exclude files matching these globs (in addition to defaults).
  --reporters=<l>    Comma-separated list: text, json, html. Default: text.
  --output=<dir>     Output directory for json/html. Default: coverage.
  --no-mcdc          Disable MC/DC instrumentation (statement+branch only).
  --verbose          In text report, show per-decision MC/DC details.
  --help             Show this help.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }
  const cmd = argv[0];
  const rest = argv.slice(1);
  const parsed = parseArgs(rest);
  const cliConfig = {};
  if (parsed.flags.root) cliConfig.root = parsed.flags.root;
  if (parsed.flags.include) cliConfig.include = splitList(parsed.flags.include);
  if (parsed.flags.exclude) {
    const extra = splitList(parsed.flags.exclude);
    cliConfig.exclude = (cliConfig.exclude || []).concat(extra);
  }
  if (parsed.flags.reporters)
    cliConfig.reporters = splitList(parsed.flags.reporters);
  if (parsed.flags.output) cliConfig.outputDir = parsed.flags.output;
  if (parsed.flags['no-mcdc']) cliConfig.mcdc = false;
  if (parsed.flags.verbose) cliConfig.verbose = true;

  const cwd = process.cwd();
  const configPath = parsed.flags.config;
  if (configPath) {
    // Load the explicitly-provided config file.
    const absPath = path.resolve(cwd, configPath);
    const cfg = absPath.endsWith('.json')
      ? JSON.parse(fs.readFileSync(absPath, 'utf8'))
      : require(absPath);
    Object.assign(cliConfig, cfg);
  }

  if (cmd === 'instrument') {
    const file = parsed._[0];
    if (!file) throw new Error('jscov instrument: missing file argument');
    const { instrument } = require('../src/instrument');
    const abs = path.resolve(cwd, file);
    const src = fs.readFileSync(abs, 'utf8');
    const { code } = instrument(src, abs);
    process.stdout.write(code);
    return 0;
  }

  const config = resolveConfig(cliConfig, cwd);
  // Apply default exclude patterns if user didn't override.
  const excludeDefaults = ['node_modules/**', 'coverage/**', '.cov-cache/**'];
  config.exclude = Array.from(new Set((config.exclude || []).concat(excludeDefaults)));

  let coverage;
  if (cmd === 'run') {
    const entry = parsed._[0] || config.entry;
    if (!entry) throw new Error('jscov run: missing entry file');
    const absEntry = path.resolve(config.root, entry);
    const args = parsed.passthrough;
    coverage = await runScript({
      entry: absEntry,
      root: config.root,
      include: config.include,
      exclude: config.exclude,
      mcdc: config.mcdc,
      coverageVariable: config.coverageVariable,
      args,
    });
  } else if (cmd === 'test') {
    const command = parsed.passthrough[0] || config.command;
    const cmdArgs = parsed.passthrough.slice(1).concat(config.args || []);
    if (!command)
      throw new Error(
        'jscov test: missing command (use `jscov test -- mocha test/`)'
      );
    const { coverage: cov, code } = await runCommand({
      command,
      args: cmdArgs,
      root: config.root,
      include: config.include,
      exclude: config.exclude,
      mcdc: config.mcdc,
      coverageVariable: config.coverageVariable,
    });
    coverage = cov;
    if (code !== 0) {
      process.stderr.write(`jscov: child command exited with code ${code}\n`);
    }
  } else if (cmd === 'report') {
    const input = parsed.flags.input;
    if (!input) throw new Error('jscov report: --input=coverage.json required');
    const abs = path.resolve(cwd, input);
    coverage = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } else {
    process.stderr.write(`jscov: unknown command "${cmd}"\n${USAGE}`);
    return 2;
  }

  const summary = summarize(coverage);
  const reporters = config.reporters || ['text'];
  for (const r of reporters) {
    if (r === 'text') {
      process.stdout.write(
        reportText(summary, { root: config.root, verbose: config.verbose }) + '\n'
      );
    } else if (r === 'json') {
      fs.mkdirSync(config.outputDir, { recursive: true });
      const out = path.join(config.outputDir, 'coverage-summary.json');
      fs.writeFileSync(out, reportJson(summary));
      fs.writeFileSync(
        path.join(config.outputDir, 'coverage-raw.json'),
        JSON.stringify(coverage)
      );
      process.stderr.write(`jscov: wrote ${out}\n`);
    } else if (r === 'html') {
      const out = path.join(config.outputDir, 'index.html');
      writeHtml(summary, out, { root: config.root });
      process.stderr.write(`jscov: wrote ${out}\n`);
    } else {
      process.stderr.write(`jscov: unknown reporter "${r}"\n`);
    }
  }
  return 0;
}

main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    process.stderr.write(`jscov: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
