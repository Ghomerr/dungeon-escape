'use strict';
/** Replay a single simulated game and dump the engine log + AP accounting. */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const Game = require(path.join(ROOT, 'server', 'game.js'));
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

const seed = parseInt(process.argv[2] || '1', 10);
const n = parseInt(process.argv[3] || '4', 10);
const style = process.argv[4] || 'explore';
const opts = { style, effort: 'safe', selfHeal: true, difficulty: 'normal' };

Math.random = mulberry32(seed);
const roster = CHARACTERS.map(c => c.id).slice(0, 8);
for (let i = roster.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[roster[i], roster[j]] = [roster[j], roster[i]]; }
const room = {
    users: [{ id: 'BOT', isRobot: false }],
    selectedCharacters: roster.slice(0, n).map(id => ({ charId: id, ownerId: 'BOT' })),
    difficulty: 'normal'
};
Game.initGame(room);
const g = room.game;
const all = [];
g.log.push = function (...a) { all.push(...a); return Array.prototype.push.apply(this, a); };

const actionCount = {};
let guard = 0, fails = 0;
while (g.status === 'PLAYING' && guard++ < 300000) {
    const c = g.characters.find(x => x.id === g.activeId);
    if (!c) break;
    const d = Bot.decide(room, c, opts);
    const res = Game.applyAction(room, 'BOT', d.action, d.payload || {});
    const key = d.action + (res && res.ok ? '' : ' [FAIL:' + (res && res.error) + ']');
    actionCount[key] = (actionCount[key] || 0) + 1;
    if (!res || !res.ok) {
        if (++fails >= 3) { fails = 0; Game.applyAction(room, 'BOT', g.pending ? 'confirm-placement' : 'end-turn', {}); }
    } else fails = 0;
}

console.log(all.join('\n'));
console.log('\n--- ACTIONS ---');
Object.entries(actionCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(5), k));
console.log('\n--- FIN ---');
console.log('status', g.status, 'rank', g.rank, 'round', g.round, 'tuiles', Object.keys(g.board).length, 'pioche', g.deck.length);
console.log('chars', g.characters.map(c => `${c.name} hp=${c.hp} ${c.escaped ? 'ESCAPED' : c.dead ? 'DEAD' : c.conscious ? 'ok' : 'KO'}`).join(' | '));
