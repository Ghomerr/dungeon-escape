'use strict';
/**
 * Ablation sweep : run the same bot under variations of the rules to see which
 * single factor moves the win rate. One line per scenario.
 *
 *   node tools/sim/ablation.js [games] [chars]
 */
const { playOne, summarize } = require('./simulate.js');

const games = parseInt(process.argv[2] || '100', 10);
const chars = parseInt(process.argv[3] || '4', 10);

const BASE = { difficulty: 'normal', style: 'explore', effort: 'never', selfHeal: true, roster: 'random', tweak: null };

const SCENARIOS = [
    ['référence (règles actuelles)', {}],
    ['-- stratégie du bot --', null],
    ['style=discover (rester groupé)', { style: 'discover' }],
    ['effort=never', { effort: 'never' }],
    ['effort=always', { effort: 'always' }],
    ['pas d\'auto-soin', { selfHeal: false }],
    ['-- durée / rythme --', null],
    ['Sortie à 20 tuiles', { tweak: 'exitAt20' }],
    ['Sortie à 30 tuiles', { tweak: 'exitAt30' }],
    ['Sortie à 40 tuiles', { tweak: 'exitAt40' }],
    ['Sortie à 50 tuiles', { tweak: 'exitAt50' }],
    ['+6 tours (28 événements)', { tweak: 'turnsPlus6' }],
    ['+12 tours (34 événements)', { tweak: 'turnsPlus12' }],
    ['-- ressources --', null],
    ['+1 PV pour tous', { tweak: 'hpPlus1' }],
    ['+2 PV pour tous', { tweak: 'hpPlus2' }],
    ['3 PA par tour', { tweak: 'apPlus1' }],
    ['-- bornes hautes (diagnostic) --', null],
    ['PV infinis (aucune usure)', { tweak: 'hp99' }],
    ['PV infinis + sans Dragon', { tweak: 'invincible' }],
    ['-- événements --', null],
    ['sans Dragon', { tweak: 'noDragon' }],
    ['sans Poison', { tweak: 'noPoison' }],
    ['sans Malédiction', { tweak: 'noCurse' }],
    ['sans Incendie', { tweak: 'noFire' }],
    ['sans Obscurité', { tweak: 'noGloom' }]
];

console.log(`\nAblations — ${games} parties, ${chars} personnages, difficulté normale\n`);
console.log('scénario'.padEnd(34) + 'victoire  sortie%  tuiles  tour-sortie  KO   sortis');
console.log('-'.repeat(84));

for (const [label, over] of SCENARIOS) {
    if (over === null) { console.log(label); continue; }
    const opts = Object.assign({}, BASE, over);
    const results = [];
    for (let i = 0; i < games; i++) results.push(playOne(chars, opts, 1000003 + chars * 7919 + i));
    const s = summarize(results, chars);
    console.log(
        label.padEnd(34) +
        (100 * s.winRate).toFixed(0).padStart(6) + '%  ' +
        (100 * s.exitFoundRate).toFixed(0).padStart(6) + '%  ' +
        s.avgTiles.toFixed(1).padStart(6) + '  ' +
        (s.avgExitRound ? s.avgExitRound.toFixed(1) : '—').padStart(11) + '  ' +
        s.avgKnockouts.toFixed(1).padStart(4) + '  ' +
        s.avgEscaped.toFixed(2).padStart(6)
    );
}
console.log();
