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

// ---------- country guess (privacy friendly, no IP involved) ----------
// The browser timezone gives a rough country guess, e.g. Europe/Berlin -> DE.
// Only this two-letter code is ever sent to the server.

var TIMEZONE_COUNTRIES = {
    'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
    'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
    'Europe/Paris': 'FR', 'Europe/Monaco': 'MC', 'Europe/Luxembourg': 'LU',
    'Europe/London': 'GB', 'Europe/Dublin': 'IE',
    'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Lisbon': 'PT',
    'Europe/Rome': 'IT', 'Europe/Malta': 'MT', 'Europe/Amsterdam': 'NL',
    'Europe/Brussels': 'BE', 'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE',
    'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI', 'Atlantic/Reykjavik': 'IS',
    'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK',
    'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
    'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR', 'Asia/Nicosia': 'CY',
    'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU',
    'Europe/Minsk': 'BY', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT',
    'Europe/Tallinn': 'EE', 'Europe/Zagreb': 'HR', 'Europe/Belgrade': 'RS',
    'Europe/Ljubljana': 'SI', 'Europe/Sarajevo': 'BA', 'Europe/Skopje': 'MK',
    'Europe/Tirane': 'AL',

    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
    'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
    'America/Mexico_City': 'MX', 'America/Bogota': 'CO', 'America/Lima': 'PE',
    'America/Santiago': 'CL', 'America/Argentina/Buenos_Aires': 'AR',
    'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR',
    'America/Manaus': 'BR', 'America/Recife': 'BR',
    'America/Caracas': 'VE', 'America/Montevideo': 'UY', 'America/Guayaquil': 'EC',
    'America/La_Paz': 'BO', 'America/Asuncion': 'PY', 'America/Panama': 'PA',
    'America/Costa_Rica': 'CR', 'America/Guatemala': 'GT', 'America/Havana': 'CU',
    'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR',

    'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
    'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH',
    'Asia/Ho_Chi_Minh': 'VN', 'Asia/Manila': 'PH', 'Asia/Hong_Kong': 'HK',
    'Asia/Taipei': 'TW', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP',
    'Asia/Seoul': 'KR', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
    'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK',
    'Asia/Kathmandu': 'NP', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA',
    'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Baghdad': 'IQ',
    'Asia/Tehran': 'IR', 'Asia/Jerusalem': 'IL', 'Asia/Amman': 'JO',
    'Asia/Beirut': 'LB', 'Asia/Baku': 'AZ', 'Asia/Yerevan': 'AM',
    'Asia/Tbilisi': 'GE', 'Asia/Almaty': 'KZ', 'Asia/Tashkent': 'UZ',

    'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ',
    'Africa/Tunis': 'TN', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH',
    'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Addis_Ababa': 'ET',
    'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG', 'Africa/Abidjan': 'CI',

    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
    'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
    'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ'
};

// 'ZZ' is the official ISO code for "unknown region": every game is counted,
// even when the browser reveals no usable timezone.
function guessCountry () {
    try {
        var timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timezone && TIMEZONE_COUNTRIES[timezone]) {
            return TIMEZONE_COUNTRIES[timezone];
        }
    } catch (e) {
        // Intl not available: fall through
    }

    // fallback: region from the browser language, e.g. "de-DE" -> DE
    try {
        var match = (navigator.language || '').match(/[-_]([A-Za-z]{2})\b/);
        if (match) {
            return match[1].toUpperCase();
        }
    } catch (e) {
        // fall through
    }

    return 'ZZ';
}

// 'DE' -> flag emoji, unknown region -> globe
function countryFlag (code) {
    if (code === 'ZZ') return '🌍';
    return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65)
         + String.fromCodePoint(0x1F1E6 + code.charCodeAt(1) - 65);
}

// 'DE' -> 'Germany' (falls back to the code itself)
function countryName (code) {
    if (code === 'ZZ') return 'Unknown';
    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch (e) {
        return code;
    }
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
            firstMove: firstMove || '',
            country: guessCountry()
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
