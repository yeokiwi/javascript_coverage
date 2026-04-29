'use strict';

/**
 * MC/DC analysis.
 *
 * For each decision we look at the recorded observations (unique tuples of
 * atom values + outcome) and try to find, for every atom i, an independence
 * pair (A, B) such that:
 *   - A[i] and B[i] are both observed (T/F, not short-circuited),
 *   - A[i] ≠ B[i],
 *   - A.outcome ≠ B.outcome,
 *   - the other atoms satisfy the variant's matching rule:
 *       * "unique"  — A[j] === B[j] for all j ≠ i (strict; X counts as its own
 *                     value, so X-X matches but T-X does not).
 *       * "classic" — A[j] === B[j] OR one of A[j], B[j] is X (short-circuit
 *                     masking: an un-evaluated atom is treated as don't-care).
 *
 * Returns per-atom coverage plus a summary.
 */

function decisionCoverage(observations) {
  const obs = Object.values(observations);
  let sawTrue = false;
  let sawFalse = false;
  for (const o of obs) {
    if (o.outcome === true) sawTrue = true;
    else if (o.outcome === false) sawFalse = true;
  }
  return { covered: sawTrue && sawFalse, sawTrue, sawFalse };
}

function conditionCoverage(atomCount, observations) {
  const obs = Object.values(observations);
  const perAtom = new Array(atomCount);
  for (let i = 0; i < atomCount; i++) {
    let t = false, f = false;
    for (const o of obs) {
      if (o.conditions[i] === true) t = true;
      else if (o.conditions[i] === false) f = true;
    }
    perAtom[i] = { sawTrue: t, sawFalse: f, covered: t && f };
  }
  return perAtom;
}

function pairMatches(A, B, i, atomCount, mode) {
  const aI = A.conditions[i];
  const bI = B.conditions[i];
  if (aI === null || bI === null) return false;
  if (aI === bI) return false;
  if (A.outcome === B.outcome) return false;
  for (let j = 0; j < atomCount; j++) {
    if (j === i) continue;
    const aJ = A.conditions[j];
    const bJ = B.conditions[j];
    if (mode === 'unique') {
      if (aJ !== bJ) return false;
    } else {
      // classic: X acts as don't-care
      if (aJ === null || bJ === null) continue;
      if (aJ !== bJ) return false;
    }
  }
  return true;
}

function analyzeMcdc(atomCount, observations, mode = 'classic') {
  const obs = Object.values(observations);
  const perAtom = new Array(atomCount);
  for (let i = 0; i < atomCount; i++) {
    let found = null;
    for (let a = 0; a < obs.length && !found; a++) {
      for (let b = 0; b < obs.length && !found; b++) {
        if (a === b) continue;
        if (pairMatches(obs[a], obs[b], i, atomCount, mode)) {
          found = { a: obs[a], b: obs[b] };
        }
      }
    }
    perAtom[i] = { covered: !!found, pair: found };
  }
  const coveredCount = perAtom.filter((x) => x.covered).length;
  return {
    mode,
    perAtom,
    covered: coveredCount,
    total: atomCount,
  };
}

module.exports = {
  decisionCoverage,
  conditionCoverage,
  analyzeMcdc,
  pairMatches,
};
