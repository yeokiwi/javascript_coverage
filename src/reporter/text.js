'use strict';

function bar(pct) {
  const n = Math.round(pct / 5);
  return '[' + '#'.repeat(n).padEnd(20, '.') + ']';
}

function line(label, data) {
  const pct = data.pct.toFixed(2).padStart(6) + '%';
  return `  ${label.padEnd(22)} ${pct}  ${data.covered}/${data.total}`;
}

function shortPath(p, root) {
  if (!root) return p;
  const rel = require('path').relative(root, p);
  if (rel.startsWith('..')) return p;
  return rel;
}

function reportText(summary, { root, verbose = false } = {}) {
  const out = [];
  out.push('');
  out.push('=====================================================');
  out.push('  jscov coverage report');
  out.push('=====================================================');
  out.push('');
  out.push('Totals');
  out.push(line('Statements',      summary.totals.statements));
  out.push(line('Branches',        summary.totals.branches));
  out.push(line('Decisions',       summary.totals.decisions));
  out.push(line('Conditions',      summary.totals.conditions));
  out.push(line('MC/DC (classic)', summary.totals.mcdc.classic));
  out.push(line('MC/DC (unique)',  summary.totals.mcdc.unique));
  out.push('');

  const files = Object.values(summary.files);
  if (!files.length) {
    out.push('  (no files instrumented)');
    out.push('');
    return out.join('\n');
  }

  out.push('Per-file');
  const header =
    '  ' +
    'File'.padEnd(60) +
    'Stmt'.padStart(8) +
    'Br'.padStart(8) +
    'Dec'.padStart(8) +
    'Cond'.padStart(8) +
    'MC/DC(c)'.padStart(10) +
    'MC/DC(u)'.padStart(10);
  out.push(header);
  out.push('  ' + '-'.repeat(header.length - 2));
  for (const f of files) {
    out.push(
      '  ' +
        shortPath(f.path, root).padEnd(60).slice(0, 60) +
        (f.statements.pct.toFixed(1) + '%').padStart(8) +
        (f.branches.pct.toFixed(1) + '%').padStart(8) +
        (f.decisions.pct.toFixed(1) + '%').padStart(8) +
        (f.conditions.pct.toFixed(1) + '%').padStart(8) +
        (f.mcdc.classic.pct.toFixed(1) + '%').padStart(10) +
        (f.mcdc.unique.pct.toFixed(1) + '%').padStart(10)
    );
  }
  out.push('');

  if (verbose) {
    out.push('MC/DC Details');
    out.push('');
    for (const f of files) {
      if (!f.decisionDetails.length) continue;
      out.push('  ' + shortPath(f.path, root));
      for (const d of f.decisionDetails) {
        const locStr = d.loc
          ? `L${d.loc.start.line}:${d.loc.start.column}`
          : '?';
        out.push(
          `    decision #${d.id} (${d.kind} @ ${locStr}) — ${d.atomCount} atom(s)`
        );
        out.push(
          `      decision coverage : ${d.decisionCoverage.covered ? 'YES' : 'NO '}   (T=${d.decisionCoverage.sawTrue}, F=${d.decisionCoverage.sawFalse})`
        );
        for (let i = 0; i < d.atomCount; i++) {
          const cc = d.conditionCoverage[i];
          const mcc = d.mcdcClassic.perAtom[i];
          const mcu = d.mcdcUnique.perAtom[i];
          const atomLoc = d.atoms[i] && d.atoms[i].loc;
          const aLocStr = atomLoc
            ? `L${atomLoc.start.line}:${atomLoc.start.column}`
            : '';
          out.push(
            `      atom ${i} @ ${aLocStr}: cc=${cc.covered ? 'Y' : 'N'} ` +
              `mcdc(classic)=${mcc.covered ? 'Y' : 'N'} ` +
              `mcdc(unique)=${mcu.covered ? 'Y' : 'N'}`
          );
        }
        const obs = Object.values(d.observations);
        if (obs.length) {
          out.push(`      observations (${obs.length} unique):`);
          for (const o of obs) {
            const cond = o.conditions
              .map((c) => (c === true ? 'T' : c === false ? 'F' : '-'))
              .join('');
            out.push(
              `        ${cond} → ${o.outcome ? 'T' : 'F'}  (count=${o.count})`
            );
          }
        }
      }
      out.push('');
    }
  }

  return out.join('\n');
}

module.exports = { reportText };
