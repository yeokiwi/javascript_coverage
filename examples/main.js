// Entry point that drives classify() with enough inputs to fully cover MC/DC.
// Run with:  ./bin/jscov.js run examples/main.js --reporters=text --verbose

const { classify, pick } = require('./classify');

// Independence pairs for (a && b) || c:
//   atom a:  (T,T,F) → yes    vs.  (F,T,F) → no       (b, c match; a differs)
//   atom b:  (T,T,F) → yes    vs.  (T,F,F) → no       (a, c match; b differs)
//   atom c:  (T,F,F) → no     vs.  (T,F,T) → yes      (a, b match; c differs)
const cases = [
  [true, true, false],
  [false, true, false],
  [true, false, false],
  [true, false, true],
];
for (const [a, b, c] of cases) classify(a, b, c);

pick(3);
pick(-2);

console.log('exercised', cases.length, 'cases');
