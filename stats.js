/*
 * stats.js - shared helpers for the game statistics.
 *
 * Personal results live in the browser (localStorage, per device),
 * global results live on the server (stats.php / stats-data.json).
 * Used by index.html (bars below the board) and stats.html (dashboard).
 */

var STATS_STORAGE_KEY = 'khianatStats';

var DIFFICULTY_NAMES = {
    1: 'Beginner',
    2: 'Casual',
    3: 'Club',
    4: 'Strong',
    5: 'Maximum'
};

// answers of the "What level of chess player are you?" survey (poll.php)
var SURVEY_LABELS = {
    one: 'Absolute beginner',
    two: 'Ambitious student',
    three: 'Club player',
    four: 'Professional',
    five: 'I have a title'
};

function fetchPollStats () {
    return fetch('poll.php').then(function (response) {
        if (!response.ok) throw new Error('poll request failed');
        return response.json();
    });
}

// ---------- personal statistics (localStorage) ----------

function emptyPersonalStats () {
    return {
        levels: {
            '1': { w: 0, d: 0, l: 0 },
            '2': { w: 0, d: 0, l: 0 },
            '3': { w: 0, d: 0, l: 0 },
            '4': { w: 0, d: 0, l: 0 },
            '5': { w: 0, d: 0, l: 0 }
        },
        games: 0,
        shortestWin: null // { moves, level }
    };
}

function loadPersonalStats () {
    var stats = emptyPersonalStats();
    try {
        var stored = JSON.parse(window.localStorage.getItem(STATS_STORAGE_KEY));
        if (stored && stored.levels) {
            for (var lv in stats.levels) {
                if (stored.levels[lv]) {
                    stats.levels[lv].w = stored.levels[lv].w || 0;
                    stats.levels[lv].d = stored.levels[lv].d || 0;
                    stats.levels[lv].l = stored.levels[lv].l || 0;
                }
            }
            stats.games = stored.games || 0;
            if (stored.shortestWin && stored.shortestWin.moves) {
                stats.shortestWin = stored.shortestWin;
            }
        }
    } catch (e) {
        // no localStorage (e.g. private mode): stats just start empty
    }
    return stats;
}

function recordPersonalResult (level, result, moves) {
    var stats = loadPersonalStats();
    var lv = String(level);
    if (!stats.levels[lv]) return stats;

    stats.levels[lv][result]++;
    stats.games++;
    if (result === 'w' && (stats.shortestWin === null || moves < stats.shortestWin.moves)) {
        stats.shortestWin = { moves: moves, level: level };
    }

    try {
        window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
        // storage not available: nothing we can do
    }
    return stats;
}

// ---------- global statistics (server) ----------

function fetchGlobalStats () {
    return fetch('stats.php').then(function (response) {
        if (!response.ok) throw new Error('stats request failed');
        return response.json();
    });
}

function postGlobalResult (level, result, moves, firstMove) {
    return fetch('stats.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            level: level,
            result: result,
            moves: moves,
            firstMove: firstMove || ''
        })
    }).then(function (response) {
        if (!response.ok) throw new Error('stats request failed');
        return response.json();
    });
}

// ---------- rendering ----------

/*
 * Renders a horizontal win/draw/loss bar plus a legend into the element.
 * counts = { w, d, l }, from the player's point of view.
 */
function renderResultBar (element, counts) {
    if (!element) return;

    var w = counts && counts.w ? counts.w : 0;
    var d = counts && counts.d ? counts.d : 0;
    var l = counts && counts.l ? counts.l : 0;
    var total = w + d + l;

    if (total === 0) {
        element.innerHTML = '<div class="result-legend">No games yet</div>';
        return;
    }

    var wp = (w / total) * 100;
    var dp = (d / total) * 100;
    var lp = (l / total) * 100;

    element.innerHTML =
        '<div class="result-bar">' +
            '<span class="seg-w" style="width:' + wp.toFixed(1) + '%"></span>' +
            '<span class="seg-d" style="width:' + dp.toFixed(1) + '%"></span>' +
            '<span class="seg-l" style="width:' + lp.toFixed(1) + '%"></span>' +
        '</div>' +
        '<div class="result-legend">' +
            Math.round(wp) + '% wins &middot; ' +
            Math.round(dp) + '% draws &middot; ' +
            Math.round(lp) + '% losses (' + total + ' game' + (total === 1 ? '' : 's') + ')' +
        '</div>';
}
