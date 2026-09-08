/*
 * sounds.js - the audio side of Khianat.
 *
 * Everything is built from three short samples plus the Web Audio API. The
 * wooden click is reused for every kind of move, but pitched and shaped
 * differently, so a capture sounds harder than a quiet move and a castle
 * sounds like two pieces being set down. That keeps one consistent timbre
 * across the whole game instead of a bag of unrelated noises, and it means
 * no extra files have to be downloaded.
 *
 * Web Audio only starts once the user has interacted with the page, which is
 * exactly how browsers want it. If it is unavailable, plain audio elements
 * take over.
 */

var Sounds = (function () {
    'use strict';

    var FILES = {
        wood: '351518__mh2o__chess-move-on-alabaster.wav',
        yes: 'mixkit-robot-says-yes-283.wav',
        no: 'mixkit-robot-says-no-282.wav'
    };

    var context = null;
    var buffers = {};
    var elements = {};   // fallback for browsers without Web Audio
    var enabled = true;
    var ready = false;

    // ---- setup ----------------------------------------------------------

    function audioContext () {
        if (context) return context;
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try {
            context = new Ctor();
        } catch (e) {
            context = null;
        }
        return context;
    }

    function load () {
        var ctx = audioContext();
        if (!ctx) return;

        Object.keys(FILES).forEach(function (name) {
            fetch(FILES[name])
                .then(function (response) { return response.arrayBuffer(); })
                .then(function (data) {
                    return new Promise(function (resolve, reject) {
                        // the callback form also works in older Safari
                        ctx.decodeAudioData(data, resolve, reject);
                    });
                })
                .then(function (buffer) {
                    buffers[name] = buffer;
                    ready = true;
                })
                .catch(function () {
                    // offline, file:// or a decoding problem: use an element
                    elements[name] = new Audio(FILES[name]);
                });
        });
    }

    /* Browsers keep audio asleep until the user has touched the page. */
    function unlock () {
        var ctx = audioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    function setEnabled (value) {
        enabled = !!value;
        if (!enabled && window.speechSynthesis) window.speechSynthesis.cancel();
    }

    // ---- building blocks ------------------------------------------------

    /* One hit of the wooden sample: rate below 1 sounds heavier. */
    function impact (rate, gain, delay) {
        var ctx = audioContext();
        if (!ctx || !buffers.wood) return playElement('wood');

        var source = ctx.createBufferSource();
        var volume = ctx.createGain();

        source.buffer = buffers.wood;
        source.playbackRate.value = rate;
        volume.gain.value = gain;

        source.connect(volume);
        volume.connect(ctx.destination);
        source.start(ctx.currentTime + (delay || 0));
    }

    function sample (name, gain) {
        var ctx = audioContext();
        if (!ctx || !buffers[name]) return playElement(name);

        var source = ctx.createBufferSource();
        var volume = ctx.createGain();

        source.buffer = buffers[name];
        volume.gain.value = gain === undefined ? 1 : gain;

        source.connect(volume);
        volume.connect(ctx.destination);
        source.start();
    }

    function playElement (name) {
        var element = elements[name];
        if (!element) return;
        try {
            element.currentTime = 0;
            element.play();
        } catch (e) { /* nothing we can do */ }
    }

    /* A short tone with a soft envelope, used for the signalling sounds. */
    function tone (frequency, duration, gain, delay, type) {
        var ctx = audioContext();
        if (!ctx) return;

        var start = ctx.currentTime + (delay || 0);
        var oscillator = ctx.createOscillator();
        var volume = ctx.createGain();

        oscillator.type = type || 'triangle';
        oscillator.frequency.value = frequency;

        volume.gain.setValueAtTime(0, start);
        volume.gain.linearRampToValueAtTime(gain, start + 0.012);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(volume);
        volume.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    }

    /* A pinch of filtered noise, which is what makes a capture bite. */
    function noise (duration, gain) {
        var ctx = audioContext();
        if (!ctx) return;

        var frames = Math.floor(ctx.sampleRate * duration);
        var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < frames; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
        }

        var source = ctx.createBufferSource();
        var filter = ctx.createBiquadFilter();
        var volume = ctx.createGain();

        source.buffer = buffer;
        filter.type = 'highpass';
        filter.frequency.value = 1200;
        volume.gain.value = gain;

        source.connect(filter);
        filter.connect(volume);
        volume.connect(ctx.destination);
        source.start();
    }

    // ---- the sounds of the game -----------------------------------------

    var EVENTS = {
        move: function () { impact(1, 0.55); },
        // heavier than a quiet move, but no longer the loudest thing around
        capture: function () { impact(0.82, 0.5); noise(0.05, 0.06); },
        castle: function () { impact(1.06, 0.45); impact(0.92, 0.6, 0.09); },
        check: function () { impact(1, 0.5); tone(1046, 0.12, 0.1, 0.02); tone(1568, 0.14, 0.08, 0.1); },
        promote: function () {
            impact(1, 0.5);
            tone(523, 0.12, 0.09, 0.02);
            tone(659, 0.12, 0.09, 0.1);
            tone(880, 0.22, 0.1, 0.18);
        },
        win: function () { sample('yes', 0.9); },          // Khianat wins
        lose: function () { sample('no', 0.9); },          // Khianat loses
        draw: function () { tone(330, 0.3, 0.09); tone(247, 0.4, 0.09, 0.12); }
    };

    function play (event) {
        if (!enabled) return;
        var handler = EVENTS[event];
        if (handler) handler();
    }

    /*
     * Works out what a move should sound like. The check signal is layered
     * on top of the move itself, so a capture with check still sounds like
     * a capture, only more urgent.
     */
    function playMove (move, givesCheck) {
        if (!enabled || !move) return;

        var castling = move.flags &&
            (move.flags.indexOf('k') !== -1 || move.flags.indexOf('q') !== -1);

        if (move.promotion) play('promote');
        else if (castling) play('castle');
        else if (move.captured) play('capture');
        else play('move');

        if (givesCheck) {
            tone(1046, 0.12, 0.1, 0.05);
            tone(1568, 0.14, 0.08, 0.13);
        }
    }

    // ---- Khianat speaks --------------------------------------------------

    var LINES = {
        capture: [
            'Betrayal detected.',
            'You will not miss that piece. Much.',
            'Trust is expensive.',
            'I was promised that square.',
            'A small sacrifice. Yours.'
        ],
        check: [
            'Your king is exposed.',
            'Look at your king. I already have.',
            'An inconvenient truth.'
        ],
        win: [
            'You trusted your queen. That was your mistake.',
            'Every plan has a traitor in it.',
            'You played well. It was not enough.',
            'Checkmate. Nothing personal.'
        ],
        lose: [
            'Khianat has been betrayed.',
            'Impressive. I will remember this.',
            'You win. This time.'
        ],
        draw: [
            'A truce. Neither of us meant it.',
            'Nobody betrayed anybody. How dull.'
        ],
        resign: [
            'Surrender is also a decision.',
            'Wise. Futile, but wise.'
        ]
    };

    var lastSpokenAt = -99;
    var moveCounter = 0;

    function countMove () { moveCounter++; }

    /*
     * Picking a voice.
     *
     * Which voices exist depends entirely on the operating system, so there
     * is no single name to ask for. These are the deep English voices that
     * actually ship with the common platforms, best first: Chrome on
     * Android and desktop, Apple devices, then Windows. If none of them are
     * there, any English voice that identifies itself as male will do, and
     * failing that we simply take the default and lean on the low pitch.
     */
    var PREFERRED_VOICES = [
        'Google UK English Male',   // Chrome
        'Microsoft Ryan',           // Windows 11
        'Microsoft George',         // Windows
        'Microsoft Guy',
        'Daniel',                   // macOS and iOS, en-GB
        'Arthur',
        'Oliver',
        'Alex',                     // macOS, en-US
        'Microsoft David',
        'Rishi'
    ];

    var MALE_NAMES = /(male|daniel|arthur|oliver|alex|fred|george|ryan|guy|david|mark|thomas|james|aaron|rishi)/i;
    var chosenVoice = null;

    function pickVoice () {
        if (!window.speechSynthesis || !window.speechSynthesis.getVoices) return null;

        var voices = window.speechSynthesis.getVoices();
        if (!voices || !voices.length) return null;

        var i, j;

        // 1. a known deep voice, in order of preference
        for (i = 0; i < PREFERRED_VOICES.length; i++) {
            for (j = 0; j < voices.length; j++) {
                if (voices[j].name.indexOf(PREFERRED_VOICES[i]) !== -1) return voices[j];
            }
        }

        // 2. any English voice that sounds like it belongs to a man
        for (j = 0; j < voices.length; j++) {
            if (/^en/i.test(voices[j].lang) &&
                MALE_NAMES.test(voices[j].name) &&
                !/female/i.test(voices[j].name)) {
                return voices[j];
            }
        }

        // 3. any English voice at all
        for (j = 0; j < voices.length; j++) {
            if (/^en/i.test(voices[j].lang)) return voices[j];
        }

        return null;
    }

    function refreshVoice () {
        chosenVoice = pickVoice();
    }

    if (window.speechSynthesis) {
        refreshVoice(); // often empty on the first call
        window.speechSynthesis.onvoiceschanged = refreshVoice;
    }

    function speak (text) {
        if (!enabled || !text || !window.speechSynthesis) return null;

        try {
            if (!chosenVoice) refreshVoice();

            var utterance = new SpeechSynthesisUtterance(text);
            if (chosenVoice) {
                utterance.voice = chosenVoice;
                utterance.lang = chosenVoice.lang;
            } else {
                utterance.lang = 'en-GB';
            }

            utterance.rate = 1.07;    // a touch above neutral, still crisp
            utterance.pitch = 0.55;   // low and unimpressed
            utterance.volume = 0.9;

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        } catch (e) { /* no speech available */ }

        return text;
    }

    /*
     * Says something in character and returns the line, or null when it stays
     * quiet. Comments during the game are rare on purpose: a taunt every move
     * would be noise, one every few games is a personality.
     */
    function taunt (category, options) {
        var settings = options || {};
        var lines = LINES[category];
        if (!lines || !lines.length) return null;

        if (!settings.always) {
            if (moveCounter - lastSpokenAt < 10) return null;
            if (Math.random() > (settings.chance === undefined ? 0.25 : settings.chance)) return null;
        }

        lastSpokenAt = moveCounter;
        return speak(lines[Math.floor(Math.random() * lines.length)]);
    }

    function resetTaunts () {
        lastSpokenAt = -99;
        moveCounter = 0;
    }

    load();

    return {
        unlock: unlock,
        setEnabled: setEnabled,
        play: play,
        playMove: playMove,
        taunt: taunt,
        countMove: countMove,
        resetTaunts: resetTaunts
    };
})();
