'use strict';

function reportJson(summary, { pretty = true } = {}) {
  return JSON.stringify(summary, null, pretty ? 2 : 0);
}

module.exports = { reportJson };
