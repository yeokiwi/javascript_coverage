'use strict';

const { instrument } = require('./instrument');
const { install, uninstall, dumpCoverage } = require('./runner/hook');
const { runScript, runCommand } = require('./runner/run');
const { summarize, summarizeFile } = require('./coverage/summary');
const { analyzeMcdc } = require('./coverage/mcdc');
const { reportText } = require('./reporter/text');
const { reportJson } = require('./reporter/json');
const { renderHtml, writeHtml } = require('./reporter/html');
const { resolveConfig } = require('./config');

module.exports = {
  instrument,
  install,
  uninstall,
  dumpCoverage,
  runScript,
  runCommand,
  summarize,
  summarizeFile,
  analyzeMcdc,
  reportText,
  reportJson,
  renderHtml,
  writeHtml,
  resolveConfig,
};
