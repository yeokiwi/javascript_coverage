// A small function with a 3-atom decision. A good test suite for MC/DC needs
// three independence pairs (one per atom) — see examples/classify.test.js.

function classify(a, b, c) {
  if ((a && b) || c) {
    return 'yes';
  }
  return 'no';
}

function pick(x) {
  return x > 0 ? 'pos' : 'neg';
}

module.exports = { classify, pick };
