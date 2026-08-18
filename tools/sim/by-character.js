'use strict';
/**
 * Which adventurers actually carry a run? Reads a --json dump from simulate.js
 * and reports outcome metrics split by "was this character in the party".
 *
 *   node tools/sim/by-character.js tools/sim/results-normal.json [nChars]
 */
const fs = require('fs');
const CHARACTERS = require('../../server/characters.js');

const file = process.argv[2] || 'tools/sim/results-normal.json';
const only = process.argv[3] ? parseInt(process.argv[3], 10) : null;
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = data.results.filter(r => !only || r.nChars === only);

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

console.log(`\nImpact de chaque personnage (${rows.length} parties${only ? ', ' + only + ' persos' : ', toutes tailles'})\n`);
console.log('personnage'.padEnd(22) + 'parties   victoire   sortis   tuiles   KO    sortie%');
console.log('-'.repeat(74));

const lines = [];
for (const c of CHARACTERS) {
    const withC = rows.filter(r => r.roster.includes(c.id));
    if (!withC.length) continue;
    lines.push({
        name: c.name, n: withC.length,
        win: avg(withC.map(r => r.status === 'WON' ? 1 : 0)),
        esc: avg(withC.map(r => r.escaped / r.nChars)),
        tiles: avg(withC.map(r => r.tilesPlaced)),
        ko: avg(withC.map(r => r.knockouts)),
        exit: avg(withC.map(r => r.exitFound ? 1 : 0))
    });
}
lines.sort((a, b) => b.win - a.win);
for (const l of lines) {
    console.log(l.name.padEnd(22) +
        String(l.n).padStart(6) +
        (100 * l.win).toFixed(1).padStart(10) + '%' +
        (100 * l.esc).toFixed(0).padStart(8) + '%' +
        l.tiles.toFixed(1).padStart(9) +
        l.ko.toFixed(2).padStart(6) +
        (100 * l.exit).toFixed(0).padStart(9) + '%');
}
console.log();
