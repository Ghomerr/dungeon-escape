'use strict';
/**
 * Full recap: every difficulty x items on/off x party size.
 *
 *   node tools/sim/matrix.js [games] [--md]
 *
 * `--md` prints a Markdown table instead of the aligned console one.
 */
const { playOne, summarize } = require('./simulate.js');

const args = process.argv.slice(2);
const games = parseInt(args.find(a => /^\d+$/.test(a)) || '400', 10);
const asMarkdown = args.includes('--md');

const BASE = { style: 'explore', effort: 'never', selfHeal: true, roster: 'random', tweak: null };
const DIFFICULTIES = ['easy', 'normal', 'advanced', 'expert'];
const LABEL = { easy: 'Facile', normal: 'Normal', advanced: 'Avancé', expert: 'Expert' };
const COUNTS = [4, 5, 6];

const rows = [];
for (const difficulty of DIFFICULTIES) {
    for (const items of [false, true]) {
        // The engine forbids items in Expert; do not pretend otherwise.
        if (items && difficulty === 'expert') continue;
        for (const n of COUNTS) {
            const opts = Object.assign({}, BASE, { difficulty, items });
            const R = [];
            for (let i = 0; i < games; i++) R.push(playOne(n, opts, 1000003 + n * 7919 + i));
            const s = summarize(R, n);
            const wins = R.filter(x => x.status === 'WON');
            rows.push({
                difficulty, items, n, games: R.length,
                win: s.winRate,
                gold: s.gold, silver: s.silver, bronze: s.bronze,
                escaped: s.avgEscaped,
                escapedWin: wins.length ? wins.reduce((a, x) => a + x.escaped, 0) / wins.length : 0,
                rounds: s.avgRounds,
                roundsWin: wins.length ? wins.reduce((a, x) => a + x.rounds, 0) / wins.length : 0,
                exitRate: s.exitFoundRate,
                potions: R.reduce((a, x) => a + (x.potionsDrunk || 0), 0) / R.length,
                scrolls: R.reduce((a, x) => a + (x.scrollsUsed || 0), 0) / R.length
            });
        }
    }
}

const pct = v => (100 * v).toFixed(1) + '%';
const f1 = v => v.toFixed(1);
const f2 = v => v.toFixed(2);

if (asMarkdown) {
    console.log('\n| Difficulté | Objets | Persos | Parties | Victoires | Or | Argent | Bronze | Sortis (moy.) | Sortis si victoire | Tours (moy.) | Tours si victoire | Sortie trouvée |');
    console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const r of rows) {
        console.log('| ' + [
            LABEL[r.difficulty], r.items ? 'oui' : 'non', r.n, r.games,
            '**' + pct(r.win) + '**', r.gold, r.silver, r.bronze,
            f2(r.escaped) + ' / ' + r.n, r.win ? f2(r.escapedWin) + ' / ' + r.n : '—',
            f1(r.rounds), r.win ? f1(r.roundsWin) : '—', pct(r.exitRate)
        ].join(' | ') + ' |');
    }
} else {
    console.log('\nRécapitulatif — ' + games + ' parties par ligne, personnages tirés au hasard\n');
    console.log('Difficulté  Objets  Persos  Victoires   Or  Arg  Brz   Sortis   SiVict  Tours  TrsVict  Sortie%');
    console.log('-'.repeat(98));
    let lastKey = null;
    for (const r of rows) {
        const key = r.difficulty + r.items;
        if (lastKey && key !== lastKey) console.log('');
        lastKey = key;
        console.log(
            LABEL[r.difficulty].padEnd(12) +
            (r.items ? 'oui' : 'non').padEnd(8) +
            String(r.n).padStart(4) + '  ' +
            pct(r.win).padStart(10) +
            String(r.gold).padStart(5) + String(r.silver).padStart(5) + String(r.bronze).padStart(5) +
            f2(r.escaped).padStart(9) +
            (r.win ? f2(r.escapedWin) : '—').padStart(9) +
            f1(r.rounds).padStart(7) +
            (r.win ? f1(r.roundsWin) : '—').padStart(9) +
            pct(r.exitRate).padStart(9)
        );
    }
    console.log('\nObjets ramassés (moy./partie), lignes « objets = oui » :');
    for (const r of rows.filter(x => x.items)) {
        console.log('  ' + (LABEL[r.difficulty] + ' ' + r.n + 'p').padEnd(14) +
            'potions bues ' + f2(r.potions) + '   parchemins lus ' + f2(r.scrolls));
    }
}
console.log();
