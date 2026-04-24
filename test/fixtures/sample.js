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
