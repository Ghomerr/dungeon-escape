'use strict';
/**
 * Headless mass-simulation of Dungeon Escape.
 *
 * Runs the REAL engine (server/game.js) with a heuristic bot controlling every
 * adventurer, so the measured win rate reflects the shipped rules.
 *
 * Usage:
 *   node tools/sim/simulate.js --games 200 --chars 4,5,6
 *   node tools/sim/simulate.js --games 200 --chars 4 --tweak exitAt40
 *   node tools/sim/simulate.js --games 200 --chars 4 --style discover
 *
 * Tweaks (ablations, to find what actually kills the run):
 *   exitAtNN      exit tile moved to index NN of the draw pile (default ~60)
 *   turnsPlusN    N extra misfortune cards (longer game)
 *   hpPlus1       every adventurer starts with +1 max HP
 *   noDragon      dragon cards replaced by curses (dragons never spawn)
 *   noPoison      poison cards replaced by curses
 *   noCurse       curse cards replaced by... gloom
 *   noFire        fire cards replaced by curses
 *   apPlus1       3 action points per turn instead of 2
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
const Game = require(path.join(ROOT, 'server', 'game.js'));
const Events = require(path.join(ROOT, 'server', 'events.js'));
const Utils = require(path.join(ROOT, 'server', 'utils.js'));
const CHARACTERS = require(path.join(ROOT, 'server', 'characters.js'));
const Bot = require('./bot.js');

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function parseArgs(argv) {
    const out = {
        games: 100, chars: [4, 5, 6], difficulty: 'normal', style: 'explore', items: false,
        extraEvents: false,
        effort: 'safe', selfHeal: true, seed: 1, json: null, roster: 'random', tweak: null
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i]; const next = () => argv[++i];
        if (a === '--games') out.games = parseInt(next(), 10);
        else if (a === '--chars') out.chars = next().split(',').map(Number);
        else if (a === '--difficulty') out.difficulty = next();
        else if (a === '--style') out.style = next();
        else if (a === '--effort') out.effort = next();
        else if (a === '--no-selfheal') out.selfHeal = false;
        else if (a === '--seed') out.seed = parseInt(next(), 10);
        else if (a === '--roster') out.roster = next();
        else if (a === '--tweak') out.tweak = next();
        else if (a === '--items') out.items = true;
        else if (a === '--extra-events') out.extraEvents = true;
        else if (a === '--json') out.json = next();
    }
    return out;
}

function pickRoster(n, opts, rnd) {
    if (opts.roster === 'first') return CHARACTERS.slice(0, n).map(c => c.id);
    if (opts.roster !== 'random') return opts.roster.split(',').slice(0, n);
    const pool = CHARACTERS.map(c => c.id);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
}

/** Apply one or several ablations ("a+b+c") to a freshly initialised game. */
function applyTweak(g, tweak, rnd) {
    if (!tweak) return;
    if (tweak.includes('+')) { for (const t of tweak.split('+')) applyTweak(g, t, rnd); return; }
    let m;
    if (tweak === 'talent3') return; // handled in playOne (module-level patch)
    // Shrink the draw pile: only `n` dungeon tiles are used, exit among the last 5.
    if ((m = /^deck(\d+)$/.exec(tweak))) {
        const n = parseInt(m[1], 10);
        const idx = g.deck.findIndex(t => t.kind === 'exit');
        const [exit] = g.deck.splice(idx, 1);
        g.deck = g.deck.slice(0, n);
        g.deck.splice(n - Math.floor(rnd() * 5), 0, exit);
        return;
    }
    if ((m = /^exitAt(\d+)$/.exec(tweak))) {
        const idx = g.deck.findIndex(t => t.kind === 'exit');
        if (idx >= 0) {
            const [exit] = g.deck.splice(idx, 1);
            g.deck.splice(Math.min(parseInt(m[1], 10), g.deck.length), 0, exit);
        }
        return;
    }
    if ((m = /^turnsPlus(\d+)$/.exec(tweak))) {
        const extra = parseInt(m[1], 10);
        for (let i = 0; i < extra; i++) {
            g.eventDeck.push({ uid: 900 + i, type: ['curse', 'poison', 'fire', 'dragon', 'gloom'][i % 5], label: 'extra', doubled: false });
        }
        g.eventDeck = Utils.shuffle(g.eventDeck);
        g.eventsTotal = g.eventDeck.length;
        return;
    }
    if (tweak === 'hpPlus1') {
        for (const c of g.characters) { c.maxHp += 1; c.hp += 1; }
        return;
    }
    if (tweak === 'hpPlus2') {
        for (const c of g.characters) { c.maxHp += 2; c.hp += 2; }
        return;
    }
    // Upper bound probes: is the AP/turn budget alone enough to reach the exit?
    if (tweak === 'hp99' || tweak === 'invincible') {
        for (const c of g.characters) { c.maxHp = 99; c.hp = 99; }
        if (tweak === 'invincible') {
            for (const c of g.eventDeck) if (c.type === 'dragon') { c.type = 'curse'; c.label = Events.LABELS.curse; }
        }
        return;
    }
    if (tweak === 'apPlus1') { g.apBonus = 1; return; }
    const swaps = {
        noDragon: ['dragon', 'curse'], noPoison: ['poison', 'curse'],
        noCurse: ['curse', 'gloom'], noFire: ['fire', 'curse'], noGloom: ['gloom', 'curse']
    };
    if (swaps[tweak]) {
        const [from, to] = swaps[tweak];
        for (const c of g.eventDeck) if (c.type === from) { c.type = to; c.label = Events.LABELS[to]; }
    }
}

function hookLog(room) {
    const all = [];
    const arr = room.game.log;
    arr.push = function (...a) { all.push(...a); return Array.prototype.push.apply(this, a); };
    return all;
}

const DMG_PATTERNS = [
    ['curse', /Malédiction : .* perd 1 PV/],
    ['gloom', /surpris par l'obscurité/],
    ['poison', /empoisonné et perd 2 PV|entre dans une tuile empoisonnée/],
    ['fire', /pris dans l'incendie|traverse les flammes/],
    ['trap', /déclenche une plaque piégée/],
    ['effort', /rate son effort/],
    ['dragonKO', /est terrassé par un Dragon/],
    ['suddenDeath', /est dévoré par les ténèbres/]
];

const ORIGINAL_TALENT = Utils.talentRoll;
function playOne(nChars, opts, seed) {
    const saved = Math.random;
    Math.random = mulberry32(seed);
    const rnd = Math.random;
    // Talent roll threshold: 4+ by default, 3+ under the `talent3` ablation.
    Utils.talentRoll = (opts.tweak && opts.tweak.includes('talent3'))
        ? ((bonus = 0) => { const value = Utils.rollDie(); const total = value + bonus; return { value, total, success: total >= 3 }; })
        : ORIGINAL_TALENT;
    const roster = pickRoster(nChars, opts, rnd);

    const room = {
        users: [{ id: 'BOT', isRobot: false }],
        selectedCharacters: roster.map(id => ({ charId: id, ownerId: 'BOT' })),
        difficulty: opts.difficulty,
        itemsEnabled: !!opts.items && opts.difficulty !== 'expert',
        extraEventsEnabled: !!opts.extraEvents
    };
    Game.initGame(room);
    const g = room.game;
    applyTweak(g, opts.tweak, rnd);
    const log = hookLog(room);
    const apBonus = g.apBonus || 0;

    let guard = 0, fails = 0;
    let exitFoundRound = null;
    let apUsed = 0, apByKind = {};
    let lastAp = g.ap;

    const seeExit = () => {
        if (exitFoundRound === null && Bot.findExitTile(g)) exitFoundRound = g.round;
    };

    while (g.status === 'PLAYING' && guard++ < 400000) {
        seeExit();
        if (apBonus && g.phase === 'ACTION' && !g.pending && g.ap === 2 && !g._boosted) {
            g.ap += apBonus; g._boosted = true;
        }
        const c = g.characters.find(x => x.id === g.activeId);
        if (!c) break;
        const decision = Bot.decide(room, c, opts);
        const before = g.ap;
        const res = Game.applyAction(room, 'BOT', decision.action, decision.payload || {});
        if (res && res.ok) {
            fails = 0;
            const spent = before - g.ap;
            if (spent > 0) { apUsed += spent; apByKind[decision.action] = (apByKind[decision.action] || 0) + spent; }
            if (decision.action === 'end-turn') g._boosted = false;
        } else if (++fails >= 3) {
            fails = 0;
            Game.applyAction(room, 'BOT', g.pending ? 'confirm-placement' : 'end-turn', {});
            g._boosted = false;
        }
    }
    seeExit();
    Math.random = saved;

    const escaped = g.characters.filter(c => c.escaped).length;
    const damage = {};
    for (const [name, re] of DMG_PATTERNS) damage[name] = log.filter(l => re.test(l)).length;
    const tilesPlaced = Object.keys(g.board).length - 1;
    const lostTurns = log.filter(l => /est inconscient et passe son tour/.test(l)).length;

    // Why did it end?
    let reason;
    if (g.status === 'WON') reason = 'won';
    else if (!exitFoundRound) reason = 'exit-never-found';
    else reason = 'exit-found-too-late';

    return {
        nChars, status: g.status, rank: g.rank || null, rounds: g.round,
        escaped, dead: g.characters.filter(c => c.dead).length,
        abandoned: nChars - escaped,
        exitFoundRound, exitFound: exitFoundRound !== null, reason,
        tilesPlaced, deckLeft: g.deck.length,
        eventsResolved: g.eventsResolved, eventsTotal: g.eventsTotal,
        suddenDeath: g.suddenDeath,
        potionsDrunk: log.filter(l => /boit une Potion/.test(l)).length,
        scrollsFound: g.scrollsFound || 0,
        scrollsUsed: log.filter(l => /Un Parchemin est lu/.test(l)).length,
        knockouts: log.filter(l => /tombe inconscient/.test(l)).length,
        revives: log.filter(l => /reprend connaissance/.test(l)).length,
        dragonsSpawned: log.filter(l => /Un Dragon surgit/.test(l)).length,
        lostTurns, apUsed, apByKind, damage,
        stuck: guard >= 400000, roster
    };
}

const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + '%' : '—');
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function summarize(results, nChars) {
    const r = results.filter(x => x.nChars === nChars);
    if (!r.length) return null;
    const wins = r.filter(x => x.status === 'WON');
    const withExit = r.filter(x => x.exitFound);
    const dmg = {}; for (const [k] of DMG_PATTERNS) dmg[k] = avg(r.map(x => x.damage[k]));
    const apk = {};
    for (const x of r) for (const k of Object.keys(x.apByKind)) apk[k] = (apk[k] || 0) + x.apByKind[k];
    for (const k of Object.keys(apk)) apk[k] = apk[k] / r.length;
    return {
        nChars, games: r.length,
        winRate: wins.length / r.length,
        gold: r.filter(x => x.rank === 'gold').length,
        silver: r.filter(x => x.rank === 'silver').length,
        bronze: r.filter(x => x.rank === 'bronze').length,
        lost: r.length - wins.length,
        exitFoundRate: withExit.length / r.length,
        avgExitRound: avg(withExit.map(x => x.exitFoundRound)),
        avgRounds: avg(r.map(x => x.rounds)),
        avgTiles: avg(r.map(x => x.tilesPlaced)),
        avgDeckLeft: avg(r.map(x => x.deckLeft)),
        avgEscaped: avg(r.map(x => x.escaped)),
        avgKnockouts: avg(r.map(x => x.knockouts)),
        avgRevives: avg(r.map(x => x.revives)),
        avgDragons: avg(r.map(x => x.dragonsSpawned)),
        avgLostTurns: avg(r.map(x => x.lostTurns)),
        avgApUsed: avg(r.map(x => x.apUsed)),
        suddenDeathRate: r.filter(x => x.suddenDeath).length / r.length,
        stuck: r.filter(x => x.stuck).length,
        damage: dmg, apByKind: apk
    };
}

function printSummary(s) {
    console.log(`\n=== ${s.nChars} personnages — ${s.games} parties ===`);
    console.log(`  VICTOIRES         : ${pct(s.winRate * s.games, s.games)}   (Or ${s.gold} / Argent ${s.silver} / Bronze ${s.bronze} — Défaites ${s.lost})`);
    console.log(`  Sortie découverte : ${pct(s.exitFoundRate * s.games, s.games)}   tour moyen de découverte : ${s.avgExitRound.toFixed(1)}`);
    console.log(`  Tuiles posées     : ${s.avgTiles.toFixed(1)} / 65   (pioche restante : ${s.avgDeckLeft.toFixed(1)})`);
    console.log(`  Tours joués       : ${s.avgRounds.toFixed(1)}   Mort subite atteinte : ${pct(s.suddenDeathRate * s.games, s.games)}`);
    console.log(`  Aventuriers sortis: ${s.avgEscaped.toFixed(2)} / ${s.nChars}`);
    console.log(`  KO / réveils      : ${s.avgKnockouts.toFixed(2)} / ${s.avgRevives.toFixed(2)}   tours perdus inconscient : ${s.avgLostTurns.toFixed(1)}`);
    console.log(`  Dragons apparus   : ${s.avgDragons.toFixed(2)}`);
    console.log(`  Dégâts par source : ` + Object.entries(s.damage).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  '));
    console.log(`  PA dépensés (${s.avgApUsed.toFixed(0)}) : ` + Object.entries(s.apByKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v.toFixed(1)}`).join('  '));
    if (s.stuck) console.log(`  ⚠️ parties bloquées : ${s.stuck}`);
}

function main() {
    const opts = parseArgs(process.argv);
    const t0 = Date.now();
    const results = [];
    for (const n of opts.chars) {
        for (let i = 0; i < opts.games; i++) {
            results.push(playOne(n, opts, opts.seed * 1000003 + n * 7919 + i));
        }
    }
    const summaries = opts.chars.map(n => summarize(results, n)).filter(Boolean);
    console.log(`\nDungeon Escape — simulation (${opts.difficulty}, style=${opts.style}, effort=${opts.effort}, roster=${opts.roster}, tweak=${opts.tweak || 'aucun'}, seed=${opts.seed})`);
    summaries.forEach(printSummary);
    console.log(`\nDurée : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (opts.json) {
        fs.writeFileSync(opts.json, JSON.stringify({ opts, summaries, results }, null, 1));
        console.log(`Détails : ${opts.json}`);
    }
}

if (require.main === module) main();
module.exports = { playOne, summarize, printSummary };
