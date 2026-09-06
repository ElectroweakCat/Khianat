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
 * Fits a puzzle rating to the solve rates.
 *
 * The model is the Elo formula itself: someone rated R is expected to solve a
 * puzzle rated P with probability 1 / (1 + 10^((P - R) / 400)). The rating
 * that makes the observed results most likely is the answer.
 *
 * This beats simply looking for the band where the solve rate crosses 50%,
 * because it uses every band instead of two, and still works when the
 * crossing point lies outside the range that was measured.
 *
 * Bands are [{ from, to, solved, total }]. Their midpoints stand in for the
 * individual puzzle ratings, which is a small source of error.
 */
function fitPuzzleRating (bands) {
    const points = (bands || [])
        .filter(band => band.total > 0)
        .map(band => ({
            rating: (band.from + band.to) / 2,
            solved: band.solved,
            total: band.total
        }));

    if (points.length === 0) return null;

    function logLikelihood (rating) {
        let sum = 0;
        for (const point of points) {
            const expected = 1 / (1 + Math.pow(10, (point.rating - rating) / 400));
            sum += point.solved * Math.log(Math.max(expected, 1e-12)) +
                   (point.total - point.solved) * Math.log(Math.max(1 - expected, 1e-12));
        }
        return sum;
    }

    const MIN = 0;
    const MAX = 3500;
    const STEP = 5;

    let best = MIN;
    let bestValue = -Infinity;
    for (let rating = MIN; rating <= MAX; rating += STEP) {
        const value = logLikelihood(rating);
        if (value > bestValue) { bestValue = value; best = rating; }
    }

    // 95% interval: every rating within 1.92 log-likelihood units of the peak
    const threshold = bestValue - 1.92;
    let low = best;
    let high = best;
    while (low - STEP >= MIN && logLikelihood(low - STEP) >= threshold) low -= STEP;
    while (high + STEP <= MAX && logLikelihood(high + STEP) >= threshold) high += STEP;

    return {
        rating: best,
        low,
        high,
        // false when the data does not pin the rating down from both sides
        bounded: low > MIN && high < MAX
    };
}

module.exports = { eloDifference, eloConfidence, fitPuzzleRating };
