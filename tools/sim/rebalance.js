'use strict';
/**
 * Candidate re-balances : which change (or combination) brings the normal
 * difficulty back to a ~50 % win rate for 4 adventurers?
 *
 *   node tools/sim/rebalance.js [games]
 */
const { playOne, summarize } = require('./simulate.js');

const games = parseInt(process.argv[2] || '300', 10);
const BASE = { difficulty: 'normal', style: 'explore', effort: 'never', selfHeal: true, roster: 'random', tweak: null };

const CANDIDATES = [
    ['référence (actuel)', null],
    ['-- un seul levier --', null],
    ['pioche de 45 tuiles', 'deck45'],
    ['pioche de 40 tuiles', 'deck40'],
    ['pioche de 35 tuiles', 'deck35'],
    ['jet de talent réussi sur 3+', 'talent3'],
    ['+1 PV pour tous', 'hpPlus1'],
    ['+2 PV pour tous', 'hpPlus2'],
    ['-- combinaisons --', null],
    ['pioche 45 + 1 PV', 'deck45+hpPlus1'],
    ['pioche 45 + talent 3+', 'deck45+talent3'],
    ['pioche 40 + 1 PV', 'deck40+hpPlus1'],
    ['pioche 40 + talent 3+', 'deck40+talent3'],
    ['pioche 45 + 1 PV + talent 3+', 'deck45+hpPlus1+talent3'],
    ['talent 3+ et +1 PV', 'hpPlus1+talent3'],
    ['pioche 50 + 1 PV + talent 3+', 'deck50+hpPlus1+talent3']
];

const counts = [4, 5, 6];
console.log(`\nPistes de rééquilibrage — ${games} parties par cellule, difficulté normale\n`);
console.log('scénario'.padEnd(32) + counts.map(n => `${n} perso`.padStart(9)).join('') + '   | 4 perso : sortie%  tuiles');
console.log('-'.repeat(84));

for (const [label, tweak] of CANDIDATES) {
    if (tweak === null && label.startsWith('--')) { console.log(label); continue; }
    const cells = [];
    let extra = '';
    for (const n of counts) {
        const opts = Object.assign({}, BASE, { tweak });
        const R = [];
        for (let i = 0; i < games; i++) R.push(playOne(n, opts, 1000003 + n * 7919 + i));
        const s = summarize(R, n);
        cells.push((100 * s.winRate).toFixed(0) + '%');
        if (n === 4) extra = `   | ${(100 * s.exitFoundRate).toFixed(0)}%  ${s.avgTiles.toFixed(1)}`;
    }
    console.log(label.padEnd(32) + cells.map(c => c.padStart(9)).join('') + extra);
}
console.log();
