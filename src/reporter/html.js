'use strict';

const fs = require('fs');
const path = require('path');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pctClass(p) {
  if (p >= 90) return 'high';
  if (p >= 75) return 'med';
  return 'low';
}

function fmtPct(p) {
  return p.toFixed(2) + '%';
}

function renderSummaryRow(label, data) {
  return `<tr>
    <th>${esc(label)}</th>
    <td class="num">${data.covered} / ${data.total}</td>
    <td class="num pct ${pctClass(data.pct)}">${fmtPct(data.pct)}</td>
  </tr>`;
}

function renderFileRow(f, shortPath) {
  const cells = [
    f.statements,
    f.branches,
    f.decisions,
    f.conditions,
    f.mcdc.classic,
    f.mcdc.unique,
  ].map(
    (x) =>
      `<td class="num pct ${pctClass(x.pct)}">${fmtPct(x.pct)}<br><span class="sub">${x.covered}/${x.total}</span></td>`
  );
  return `<tr>
    <td><a href="#${esc(shortPath)}">${esc(shortPath)}</a></td>
    ${cells.join('\n')}
  </tr>`;
}

function renderObservation(o, nAtoms) {
  const cells = [];
  for (let i = 0; i < nAtoms; i++) {
    const v = o.conditions[i];
    const cls = v === true ? 'T' : v === false ? 'F' : 'X';
    const label = v === true ? 'T' : v === false ? 'F' : '—';
    cells.push(`<td class="cond ${cls}">${label}</td>`);
  }
  const outcls = o.outcome ? 'T' : 'F';
  const outlbl = o.outcome ? 'T' : 'F';
  return `<tr>${cells.join('')}<td class="cond outcome ${outcls}">${outlbl}</td><td class="num">${o.count}</td></tr>`;
}

function renderDecision(d) {
  const loc = d.loc ? `line ${d.loc.start.line}, col ${d.loc.start.column}` : '?';
  const obs = Object.values(d.observations);
  const atomHdr = [];
  for (let i = 0; i < d.atomCount; i++) {
    const al = d.atoms[i] && d.atoms[i].loc;
    atomHdr.push(
      `<th>c<sub>${i}</sub>${al ? `<br><span class="sub">L${al.start.line}:${al.start.column}</span>` : ''}</th>`
    );
  }
  const atomRows = [];
  for (let i = 0; i < d.atomCount; i++) {
    const cc = d.conditionCoverage[i];
    const mc = d.mcdcClassic.perAtom[i];
    const mu = d.mcdcUnique.perAtom[i];
    atomRows.push(`<tr>
      <td>c<sub>${i}</sub></td>
      <td class="pass ${cc.covered ? 'y' : 'n'}">${cc.covered ? 'yes' : 'no'}</td>
      <td class="pass ${mc.covered ? 'y' : 'n'}">${mc.covered ? 'yes' : 'no'}</td>
      <td class="pass ${mu.covered ? 'y' : 'n'}">${mu.covered ? 'yes' : 'no'}</td>
    </tr>`);
  }
  return `<div class="decision">
    <h4>Decision #${d.id} <span class="sub">(${esc(d.kind)} @ ${loc}, ${d.atomCount} atom${d.atomCount === 1 ? '' : 's'})</span></h4>
    <p>Decision coverage: <strong class="${d.decisionCoverage.covered ? 'y' : 'n'}">${d.decisionCoverage.covered ? 'covered' : 'not covered'}</strong> (T=${d.decisionCoverage.sawTrue}, F=${d.decisionCoverage.sawFalse}).</p>
    <table class="atoms">
      <thead><tr><th>Atom</th><th>Cond Cov</th><th>MC/DC (classic)</th><th>MC/DC (unique)</th></tr></thead>
      <tbody>${atomRows.join('')}</tbody>
    </table>
    <table class="obs">
      <thead><tr>${atomHdr.join('')}<th>outcome</th><th>count</th></tr></thead>
      <tbody>${obs.map((o) => renderObservation(o, d.atomCount)).join('')}</tbody>
    </table>
  </div>`;
}

function renderFile(f, shortPath) {
  return `<section id="${esc(shortPath)}">
    <h3>${esc(shortPath)}</h3>
    <table class="summary">
      <tbody>
        ${renderSummaryRow('Statements', f.statements)}
        ${renderSummaryRow('Branches', f.branches)}
        ${renderSummaryRow('Decisions', f.decisions)}
        ${renderSummaryRow('Conditions', f.conditions)}
        ${renderSummaryRow('MC/DC (classic)', f.mcdc.classic)}
        ${renderSummaryRow('MC/DC (unique-cause)', f.mcdc.unique)}
      </tbody>
    </table>
    ${f.decisionDetails.length
      ? f.decisionDetails.map(renderDecision).join('\n')
      : '<p><em>No MC/DC decisions in this file.</em></p>'}
  </section>`;
}

function renderHtml(summary, { root } = {}) {
  const filesArr = Object.values(summary.files);
  const shortOf = (p) => {
    if (!root) return p;
    const rel = path.relative(root, p);
    return rel.startsWith('..') ? p : rel;
  };

  const style = `
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; margin: 24px; color: #1f2937; }
  h1, h2, h3, h4 { margin-top: 1.2em; }
  table { border-collapse: collapse; margin: 0.5em 0 1em; }
  th, td { border: 1px solid #d1d5db; padding: 4px 8px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pct { font-weight: 600; }
  .pct.high { color: #166534; background: #dcfce7; }
  .pct.med  { color: #854d0e; background: #fef9c3; }
  .pct.low  { color: #991b1b; background: #fee2e2; }
  .sub { color: #6b7280; font-size: 0.85em; font-weight: 400; }
  .cond { text-align: center; min-width: 2em; font-weight: 600; }
  .cond.T { background: #dcfce7; color: #166534; }
  .cond.F { background: #fee2e2; color: #991b1b; }
  .cond.X { background: #f3f4f6; color: #6b7280; }
  .cond.outcome { border-left: 3px solid #1f2937; }
  .pass.y, strong.y { color: #166534; }
  .pass.n, strong.n { color: #991b1b; }
  section { border-top: 1px solid #e5e7eb; padding-top: 8px; }
  .decision { background: #f9fafb; padding: 12px 16px; margin: 8px 0; border-radius: 6px; }
  nav a { margin-right: 12px; }
  `;

  const nav = filesArr
    .map((f) => `<a href="#${esc(shortOf(f.path))}">${esc(shortOf(f.path))}</a>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>jscov coverage report</title>
<style>${style}</style>
</head>
<body>
<h1>jscov coverage report</h1>
<h2>Totals</h2>
<table class="summary">
  <tbody>
    ${renderSummaryRow('Statements', summary.totals.statements)}
    ${renderSummaryRow('Branches', summary.totals.branches)}
    ${renderSummaryRow('Decisions', summary.totals.decisions)}
    ${renderSummaryRow('Conditions', summary.totals.conditions)}
    ${renderSummaryRow('MC/DC (classic)', summary.totals.mcdc.classic)}
    ${renderSummaryRow('MC/DC (unique-cause)', summary.totals.mcdc.unique)}
  </tbody>
</table>

<h2>Per-file</h2>
<table>
  <thead>
    <tr>
      <th>File</th><th>Stmt</th><th>Branch</th><th>Decision</th><th>Condition</th><th>MC/DC (classic)</th><th>MC/DC (unique)</th>
    </tr>
  </thead>
  <tbody>
    ${filesArr.map((f) => renderFileRow(f, shortOf(f.path))).join('\n')}
  </tbody>
</table>

<h2>Files</h2>
<nav>${nav}</nav>

${filesArr.map((f) => renderFile(f, shortOf(f.path))).join('\n')}

<footer><p class="sub">Generated by jscov.</p></footer>
</body>
</html>`;
}

function writeHtml(summary, outputPath, opts = {}) {
  const html = renderHtml(summary, opts);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
}

module.exports = { renderHtml, writeHtml };
