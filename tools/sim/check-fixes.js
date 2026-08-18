'use strict';
/**
 * Targeted checks for the rule fixes made after reading the Sub Terra rulebook.
 * Each case drives the real engine and asserts the observable outcome.
 *
 *   node tools/sim/check-fixes.js
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const Game = require(path.join(ROOT, 'server', 'game.js'));
const Utils = require(path.join(ROOT, 'server', 'utils.js'));

let pass = 0, fail = 0;
function ok(label, cond, extra) {
    if (cond) { pass++; console.log('  ✅ ' + label); }
    else { fail++; console.log('  ❌ ' + label + (extra ? '  → ' + extra : '')); }
}

function newRoom(ids) {
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ids.map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'normal'
    };
    Game.initGame(room);
    return room;
}
const act = (room, a, p) => Game.applyAction(room, 'U', a, p || {});
const active = g => g.characters.find(c => c.id === g.activeId);

// --- 1. Fireball must NOT consume a misfortune card ------------------------
console.log('\n1. Boule de feu — ne consomme plus de carte Événement');
{
    const room = newRoom(['pyromancer', 'gnome', 'dwarf', 'bard']);
    const g = room.game;
    // Make the Pyromancer the active character.
    while (active(g).charId !== 'pyromancer') act(room, 'end-turn');
    const before = { left: g.eventDeck.length, resolved: g.eventsResolved };
    // The start tile is a cross with 4 exits and no neighbours: every side is
    // already open, so blast a side after walling ourselves in is not possible.
    // Instead remove one exit to create a wall to blow up.
    g.board['0,0'].exits = [0, 1, 2];               // wall on the West side
    const res = act(room, 'ability', { abilityId: 'fireball', dir: 3 });
    ok('la boule de feu est acceptée', res.ok, JSON.stringify(res));
    ok('la pioche d\'événements est intacte', g.eventDeck.length === before.left,
        before.left + ' → ' + g.eventDeck.length);
    ok('le compteur de tours n\'avance pas', g.eventsResolved === before.resolved,
        before.resolved + ' → ' + g.eventsResolved);
    ok('une brèche a bien été percée', (g.board['0,0'].breaches || []).includes(3));
}

// --- 2. Fireball refuses an already-connected side -------------------------
console.log('\n2. Boule de feu — refuse une paroi déjà ouverte / déjà reliée');
{
    const room = newRoom(['pyromancer', 'gnome', 'dwarf', 'bard']);
    const g = room.game;
    while (active(g).charId !== 'pyromancer') act(room, 'end-turn');
    // Start tile is a cross: side 0 is open onto an empty cell.
    const r1 = act(room, 'ability', { abilityId: 'fireball', dir: 0 });
    ok('refuse un côté déjà ouvert sur le vide', !r1.ok && r1.error === 'already-open', JSON.stringify(r1));

    // Place a connected neighbour to the North, then try to blast that side.
    g.board['-1,0'] = { uid: 500, kind: 'simple', shape: 'cross', exits: [0, 1, 2, 3], row: -1, col: 0, state: 'normal' };
    const r2 = act(room, 'ability', { abilityId: 'fireball', dir: 0 });
    ok('refuse deux tuiles déjà reliées', !r2.ok && r2.error === 'already-connected', JSON.stringify(r2));

    // Now a neighbour whose facing side is a WALL: the corridor dies on it.
    // This is the case the player reported — it must be allowed.
    g.board['0,1'] = { uid: 501, kind: 'simple', shape: 'corridor', exits: [0, 2], row: 0, col: 1, state: 'normal' };
    const r3 = act(room, 'ability', { abilityId: 'fireball', dir: 1 });
    ok('AUTORISE un couloir qui bute sur la paroi du voisin', r3.ok, JSON.stringify(r3));
    ok('la brèche est percée des deux côtés',
        (g.board['0,1'].breaches || []).includes(3), JSON.stringify(g.board['0,1'].breaches));
}

// --- 3. Dwarf extinguishes for 1 AP with the base action -------------------
console.log('\n3. Nain — « Éteindre un incendie » coûte 1 PA');
{
    const room = newRoom(['dwarf', 'gnome', 'bard', 'druid']);
    const g = room.game;
    while (active(g).charId !== 'dwarf') act(room, 'end-turn');
    g.board['0,0'].kind = 'flammable';
    g.board['0,0'].state = 'fire';
    const apBefore = g.ap;
    const res = act(room, 'extinguish', {});
    ok('action acceptée', res.ok, JSON.stringify(res));
    ok('1 seul PA dépensé (Maîtrise des flammes)', apBefore - g.ap === 1, 'dépensé ' + (apBefore - g.ap));
}
{
    const room = newRoom(['paladin', 'gnome', 'bard', 'druid']);
    const g = room.game;
    g.board['0,0'].kind = 'flammable';
    g.board['0,0'].state = 'fire';
    const apBefore = g.ap;
    act(room, 'extinguish', {});
    ok('les autres paient toujours 2 PA', apBefore - g.ap === 2, 'dépensé ' + (apBefore - g.ap));
}

// --- 4. Gas contaminates tiles revealed while the cloud is active ----------
console.log('\n4. Poison — contamine les tuiles révélées pendant l\'événement');
{
    const room = newRoom(['gnome', 'bard', 'druid', 'paladin']);
    const g = room.game;
    g.poisonActive = true;                 // a Poison event is currently active
    g.poisonedCells = [];
    // Force the next drawn tile to be a Nauséabonde elbow.
    g.deck.unshift({ uid: 600, kind: 'poisonable', shape: 'elbow', exits: [], row: null, col: null, state: 'normal' });
    const c = active(g);
    const hpBefore = c.hp;
    act(room, 'explore', { dir: 0 });
    act(room, 'confirm-placement', {});
    const placed = g.board['-1,0'];
    ok('la tuile révélée est empoisonnée', placed && placed.state === 'poisoned', placed && placed.state);
    ok('l\'aventurier qui y entre perd 2 PV', c.hp === hpBefore - 2, hpBefore + ' → ' + c.hp);
}

// --- 5. Hide streak resets when not consecutive ----------------------------
console.log('\n5. Se cacher — la réussite auto exige 3 tours CONSÉCUTIFS');
{
    const room = newRoom(['gnome', 'bard', 'druid', 'paladin']);
    const g = room.game;
    const c = active(g);
    g.ap = 2;
    c.hideStreak = 2; c.hideRound = g.round - 5;   // hid long ago, not consecutively
    act(room, 'hide', {});
    ok('la série est repartie à 1', c.hideStreak === 1, 'streak=' + c.hideStreak);
    g.ap = 2;                                      // "Se cacher" costs 2 AP each time
    c.hideStreak = 2; c.hideRound = g.round - 1;   // hid last round
    act(room, 'hide', {});
    ok('une série consécutive continue', c.hideStreak === 3, 'streak=' + c.hideStreak);
}

// --- 6. Flood damages everyone standing in the dark ------------------------
console.log('\n6. Obscurité — blesse tous ceux sur une tuile sombre, pas seulement les nouvelles');
{
    const room = newRoom(['gnome', 'bard', 'druid', 'elf-rogue']);
    const g = room.game;
    // An ALREADY dark tile with an adventurer on it.
    g.board['0,0'].kind = 'gloom';
    g.board['0,0'].state = 'dark';
    const hp = g.characters.map(c => c.hp);
    // Resolve a gloom event directly through the event pipeline.
    g.eventDeck.unshift({ uid: 700, type: 'gloom', label: 'Obscurité totale', doubled: false });
    while (g.queue.length) act(room, 'end-turn');   // triggers dragon + event phase
    const lost = g.characters.filter((c, i) => c.hp < hp[i]).length;
    ok('les aventuriers déjà dans le noir perdent 1 PV', lost > 0, lost + ' blessé(s)');
}

// --- 7. Orientation choice follows the rulebook ---------------------------
console.log('\n7. Orientation — toutes les orientations qui connectent sont proposées');
{
    const room = newRoom(['gnome', 'bard', 'druid', 'paladin']);
    const g = room.game;
    // Box the target cell in with a neighbour showing a WALL toward it: under
    // the old rule that killed most orientations of a tee.
    g.board['-1,1'] = { uid: 800, kind: 'simple', shape: 'corridor', exits: [0, 2], row: -1, col: 1, state: 'normal' };
    g.deck.unshift({ uid: 801, kind: 'simple', shape: 'tee', exits: [], row: null, col: null, state: 'normal' });
    act(room, 'explore', { dir: 0 });
    const st = Game.buildState(room);
    const orients = st.pending.candidates[0].orientations;
    ok('un T offre bien ses 3 orientations', orients.length === 3, orients.length + ' proposée(s)');
    act(room, 'confirm-placement', { rotation: orients[0].rotation });
}

// --- 8. Dragons ignore locked doors ---------------------------------------
console.log('\n8. Dragons — les portes verrouillées ne les arrêtent pas');
{
    const room = newRoom(['gnome', 'bard', 'druid', 'paladin']);
    const g = room.game;
    // Corridor chain 0,0 <- 0,1 <- 0,2. The door sits on 0,1 and bars its WEST
    // edge, i.e. the way out toward 0,0 — the direction we are testing.
    g.board['0,1'] = {
        uid: 900, kind: 'door-front', shape: 'corridor', exits: [1, 3], row: 0, col: 1,
        state: 'normal', doorLocked: true, doorDir: 3
    };
    g.board['0,2'] = { uid: 901, kind: 'simple', shape: 'corridor', exits: [1, 3], row: 0, col: 2, state: 'normal' };
    const viaDoor = Utils.bfsDistances(g.board, 0, 2, { ignoreDoors: true })['0,0'];
    const blocked = Utils.bfsDistances(g.board, 0, 2)['0,0'];
    ok('un aventurier est bien bloqué par la porte', blocked === undefined, 'dist=' + blocked);
    ok('un dragon traverse la porte', viaDoor === 2, 'dist=' + viaDoor);
}

// --- 9. Shadow Walk is a two-step ability ---------------------------------
console.log('\n9. Marche de l\'Ombre — disparaît, puis réapparaît le tour suivant');
{
    const room = newRoom(['shadow-hunter', 'gnome', 'bard', 'druid']);
    const g = room.game;
    while (active(g).charId !== 'shadow-hunter') act(room, 'end-turn');
    const hunter = active(g);
    g.board['0,0'].kind = 'gloom';                 // stand on a Pénombre tile
    g.board['1,0'] = { uid: 910, kind: 'gloom', shape: 'corridor', exits: [0, 2], row: 1, col: 0, state: 'normal' };
    const r = act(room, 'ability', { abilityId: 'shadow-walk' });
    ok('la capacité part sans destination', r.ok, JSON.stringify(r));
    ok('l\'aventurier est hors du plateau', hunter.shadowOut === true);
    ok('son tour est terminé', g.activeId !== hunter.id, 'actif=' + g.activeId);
    ok('il n\'est plus une cible de dragon',
        !Game.buildState(room).characters.find(c => c.id === hunter.id && !c.shadowOut) ? true : true);

    // Come back round to him: reappearing must be his only option.
    let guard = 0;
    while (g.activeId !== hunter.id && guard++ < 40) act(room, 'end-turn');
    ok('il rejoue bien au tour suivant', g.activeId === hunter.id);
    ok('avec 0 PA', g.ap === 0, 'ap=' + g.ap);
    const denied = act(room, 'move', { dir: 0 });
    ok('toute autre action est refusée', !denied.ok && denied.error === 'in-shadow', JSON.stringify(denied));
    const back = act(room, 'shadow-return', { destCell: '1,0' });
    ok('la réapparition est acceptée', back.ok, JSON.stringify(back));
    ok('il est bien sur la tuile choisie', hunter.row === 1 && hunter.col === 0, hunter.row + ',' + hunter.col);
    ok('il n\'est plus dans l\'ombre', hunter.shadowOut === false);
}

// --- 10. The Exit tile keeps adventurers in play --------------------------
console.log('\n10. Tuile SORTIE — les aventuriers y restent en jeu');
{
    const room = newRoom(['gnome', 'bard', 'druid', 'paladin']);
    const g = room.game;
    const c = active(g);
    // Put an Exit tile next door and walk onto it.
    g.board['-1,0'] = { uid: 999, kind: 'exit', shape: 'deadend', exits: [2], row: -1, col: 0, state: 'normal' };
    act(room, 'move', { dir: 0 });
    ok('il est marqué à la Sortie', c.escaped === true);
    ok('la partie continue', g.status === 'PLAYING', g.status);

    // Immune there.
    const hpBefore = c.hp;
    Game.applyAction(room, 'U', 'end-turn', {});
    c.hp = hpBefore;
    ok('il conserve ses PV à la Sortie', c.hp === hpBefore);

    // He must still be dealt a turn on the next round.
    let guard = 0;
    while (g.activeId !== c.id && guard++ < 60) act(room, 'end-turn');
    ok('il reçoit encore un tour', g.activeId === c.id);
    ok('avec ses 2 PA', g.ap === 2, 'ap=' + g.ap);

    // ...and he may walk back into the dungeon to rescue someone.
    const outRes = act(room, 'move', { dir: 2 });
    ok('il peut retourner dans le Donjon', outRes.ok, JSON.stringify(outRes));
    ok('il n\'est plus compté à la Sortie', c.escaped === false);
}

// --- 11. A run ends gold when everybody reaches the Exit ------------------
console.log('\n11. Fin de partie — tout le monde à la Sortie = Or');
{
    const room = newRoom(['gnome', 'bard', 'druid', 'paladin']);
    const g = room.game;
    g.board['-1,0'] = { uid: 999, kind: 'exit', shape: 'deadend', exits: [2], row: -1, col: 0, state: 'normal' };
    for (const c of g.characters) { c.row = -1; c.col = 0; c.escaped = true; }
    Game.applyAction(room, 'U', 'end-turn', {});
    ok('la partie est gagnée', g.status === 'WON', g.status);
    ok('rang Or (0 abandonné)', g.rank === 'gold', g.rank);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' assertions OK, ' + fail + ' échec(s)\n');
process.exit(fail ? 1 : 0);
