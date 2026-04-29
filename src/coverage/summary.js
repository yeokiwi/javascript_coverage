'use strict';

const { decisionCoverage, conditionCoverage, analyzeMcdc } = require('./mcdc');

/**
 * Turn the raw global coverage object into a structured summary with three
 * coverage metrics computed per file: statement, decision (aka branch), and
 * MC/DC (both classic-with-masking and strict unique-cause).
 */
function pct(covered, total) {
  if (!total) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

function summarizeFile(filePath, fileEntry, opts = {}) {
  // Statement coverage — from Istanbul counters.
  const s = fileEntry.s || {};
  const statementMap = fileEntry.statementMap || {};
  const statementIds = Object.keys(statementMap);
  let stmtCovered = 0;
  for (const id of statementIds) if ((s[id] || 0) > 0) stmtCovered++;

  // Branch (decision-outcome) coverage — from Istanbul. Istanbul records a
  // hit count per outcome of every branch; both outcomes must be hit.
  const b = fileEntry.b || {};
  const branchMap = fileEntry.branchMap || {};
  const branchIds = Object.keys(branchMap);
  let branchTotal = 0;
  let branchCovered = 0;
  for (const id of branchIds) {
    const hits = b[id] || [];
    for (const h of hits) {
      branchTotal++;
      if (h > 0) branchCovered++;
    }
  }

  // MC/DC — from our own bookkeeping.
  const mcdcMap = fileEntry.mcdcMap || {};
  const mcdcData = fileEntry.mcdc || {};
  const decisions = Object.keys(mcdcMap).map((id) => {
    const meta = mcdcMap[id];
    const obs = (mcdcData[id] && mcdcData[id].observations) || {};
    const dec = decisionCoverage(obs);
    const cc = conditionCoverage(meta.atomCount, obs);
    const classic = analyzeMcdc(meta.atomCount, obs, 'classic');
    const unique = analyzeMcdc(meta.atomCount, obs, 'unique');
    return {
      id: Number(id),
      loc: meta.loc,
      kind: meta.kind,
      atomCount: meta.atomCount,
      atoms: meta.atoms,
      observations: obs,
      decisionCoverage: dec,
      conditionCoverage: cc,
      mcdcClassic: classic,
      mcdcUnique: unique,
    };
  });

  // Aggregate.
  let mcdcClassicCovered = 0;
  let mcdcUniqueCovered = 0;
  let mcdcTotal = 0;
  let ccCovered = 0;
  let ccTotal = 0;
  let decisionTotal = 0;
  let decisionCovered = 0;
  for (const d of decisions) {
    mcdcTotal += d.atomCount;
    mcdcClassicCovered += d.mcdcClassic.covered;
    mcdcUniqueCovered += d.mcdcUnique.covered;
    ccTotal += d.atomCount;
    for (const a of d.conditionCoverage) if (a.covered) ccCovered++;
    decisionTotal++;
    if (d.decisionCoverage.covered) decisionCovered++;
  }

  return {
    path: filePath,
    statements: {
      total: statementIds.length,
      covered: stmtCovered,
      pct: pct(stmtCovered, statementIds.length),
    },
    branches: {
      total: branchTotal,
      covered: branchCovered,
      pct: pct(branchCovered, branchTotal),
    },
    decisions: {
      total: decisionTotal,
      covered: decisionCovered,
      pct: pct(decisionCovered, decisionTotal),
    },
    conditions: {
      total: ccTotal,
      covered: ccCovered,
      pct: pct(ccCovered, ccTotal),
    },
    mcdc: {
      classic: {
        total: mcdcTotal,
        covered: mcdcClassicCovered,
        pct: pct(mcdcClassicCovered, mcdcTotal),
      },
      unique: {
        total: mcdcTotal,
        covered: mcdcUniqueCovered,
        pct: pct(mcdcUniqueCovered, mcdcTotal),
      },
    },
    decisionDetails: decisions,
  };
}

function summarize(coverage, opts = {}) {
  const files = {};
  let totals = {
    statements: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    decisions: { total: 0, covered: 0 },
    conditions: { total: 0, covered: 0 },
    mcdcClassic: { total: 0, covered: 0 },
    mcdcUnique: { total: 0, covered: 0 },
  };
  for (const [file, entry] of Object.entries(coverage || {})) {
    const s = summarizeFile(file, entry, opts);
    files[file] = s;
    totals.statements.total += s.statements.total;
    totals.statements.covered += s.statements.covered;
    totals.branches.total += s.branches.total;
    totals.branches.covered += s.branches.covered;
    totals.decisions.total += s.decisions.total;
    totals.decisions.covered += s.decisions.covered;
    totals.conditions.total += s.conditions.total;
    totals.conditions.covered += s.conditions.covered;
    totals.mcdcClassic.total += s.mcdc.classic.total;
    totals.mcdcClassic.covered += s.mcdc.classic.covered;
    totals.mcdcUnique.total += s.mcdc.unique.total;
    totals.mcdcUnique.covered += s.mcdc.unique.covered;
  }
  const withPct = (x) => ({ ...x, pct: pct(x.covered, x.total) });
  return {
    files,
    totals: {
      statements: withPct(totals.statements),
      branches: withPct(totals.branches),
      decisions: withPct(totals.decisions),
      conditions: withPct(totals.conditions),
      mcdc: {
        classic: withPct(totals.mcdcClassic),
        unique: withPct(totals.mcdcUnique),
      },
    },
  };
}

module.exports = { summarize, summarizeFile };
