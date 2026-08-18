'use strict';
/** Verify how many tiles must be drawn before the Exit tile appears. */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const Game = require(path.join(ROOT, 'server', 'game.js'));

const hist = {};
let min = 99, max = 0, sum = 0, N = 20000;
let reserveWasted = 0;
for (let i = 0; i < N; i++) {
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ['shadow-hunter', 'gnome', 'dwarf', 'pyromancer'].map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'normal'
    };
    Game.initGame(room);
    const g = room.game;
    const idx = g.deck.findIndex(t => t.kind === 'exit');
    const draws = idx + 1; // tiles to draw, exit included
    hist[draws] = (hist[draws] || 0) + 1;
    min = Math.min(min, draws); max = Math.max(max, draws); sum += draws;
    if (g.reserveTile) reserveWasted++;
}
console.log('Taille de la pioche après init :', 'voir ci-dessous');
console.log('Tuiles à piocher avant de révéler la SORTIE (n=' + N + ') :');
Object.keys(hist).map(Number).sort((a, b) => a - b).forEach(k =>
    console.log('  ' + String(k).padStart(3) + ' tuiles : ' + (100 * hist[k] / N).toFixed(1) + '%'));
console.log('  min=' + min, 'max=' + max, 'moyenne=' + (sum / N).toFixed(2));
console.log('Tuile de réserve retirée de la pioche (Mémoire de la roche) :', reserveWasted + '/' + N,
    '— retirée même sans Nain dans l\'équipe');

// Team of 4 with no Dwarf: is the reserve tile still consumed?
const room2 = {
    users: [{ id: 'U', isRobot: false }],
    selectedCharacters: ['paladin', 'bard', 'druid', 'elf-rogue'].map(id => ({ charId: id, ownerId: 'U' })),
    difficulty: 'normal'
};
Game.initGame(room2);
console.log('Équipe sans Nain -> reserveTile =', room2.game.reserveTile ? room2.game.reserveTile.kind : null,
    '| pioche =', room2.game.deck.length);
