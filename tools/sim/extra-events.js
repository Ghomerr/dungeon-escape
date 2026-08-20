'use strict';
/**
 * What the rulebook's "+3 Danger cards" concession is worth, on its own and on
 * top of the items variant.
 *
 *   node tools/sim/extra-events.js [games]
 */
const { playOne, summarize } = require('./simulate.js');

const games = parseInt(process.argv[2] || '400', 10);
const BASE = { style: 'explore', effort: 'never', selfHeal: true, roster: 'random', tweak: null };
const LABEL = { easy: 'Facile', normal: 'Normal', advanced: 'Avancé', expert: 'Expert' };

console.log('\n« +3 événements fâcheux » — ' + games + ' parties par cellule, 4 personnages\n');
console.log('Difficulté  Objets  +3 tours   Victoires   Tours  Sortie%');
console.log('-'.repeat(60));

for (const difficulty of ['easy', 'normal', 'advanced', 'expert']) {
    for (const items of [false, true]) {
        if (items && difficulty === 'expert') continue;
        for (const extra of [false, true]) {
            const opts = Object.assign({}, BASE, { difficulty, items, extraEvents: extra });
            const R = [];
            for (let i = 0; i < games; i++) R.push(playOne(4, opts, 1000003 + 4 * 7919 + i));
            const s = summarize(R, 4);
            console.log(
                LABEL[difficulty].padEnd(12) +
                (items ? 'oui' : 'non').padEnd(8) +
                (extra ? 'oui' : 'non').padEnd(11) +
                (100 * s.winRate).toFixed(1).padStart(8) + '%' +
                s.avgRounds.toFixed(1).padStart(8) +
                (100 * s.exitFoundRate).toFixed(0).padStart(8) + '%');
        }
        console.log('');
    }
}
