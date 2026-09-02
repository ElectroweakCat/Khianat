/*
 * The little bit of maths behind the Elo estimates.
 *
 * All of this only turns a match score into a rating difference. It says
 * nothing about human Elo on its own: that depends entirely on how well the
 * reference opponent is calibrated, which is why the benchmark page spells
 * out which opponent was used.
 */

// score is the share of points won (1 = every game, 0.5 = even)
function eloDifference (score) {
    if (score <= 0) return -800;   // clamped: an unbeaten opponent has no finite rating gap
    if (score >= 1) return 800;
    return -400 * Math.log10(1 / score - 1);
}

/*
 * Rough 95% confidence interval of that rating difference, in Elo points.
 * Draws are counted as half points, which slightly overstates the spread,
 * so this errs on the cautious side.
 */
function eloConfidence (score, games) {
    if (games < 2 || score <= 0 || score >= 1) return null;

    const standardError = Math.sqrt((score * (1 - score)) / games);
    const slope = 400 / (Math.LN10 * score * (1 - score)); // d(Elo)/d(score)
    return Math.round(1.96 * standardError * slope);
}

/*
 * Where does the solve rate cross 50%? Bands are
 * [{ from, to, solved, total }] in ascending order. Returns null when the
 * data never crosses, which is an honest answer for a small sample.
 */
function crossingRating (bands) {
    const points = bands
        .filter(band => band.total > 0)
        .map(band => ({ rating: (band.from + band.to) / 2, rate: band.solved / band.total }));

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (a.rate >= 0.5 && b.rate < 0.5) {
            const span = a.rate - b.rate;
            const share = span === 0 ? 0.5 : (a.rate - 0.5) / span;
            return Math.round(a.rating + share * (b.rating - a.rating));
        }
    }
    return null;
}

module.exports = { eloDifference, eloConfidence, crossingRating };
