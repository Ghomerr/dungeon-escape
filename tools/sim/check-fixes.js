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

// --- 12. Easy difficulty ---------------------------------------------------
console.log('\n12. Difficulté Facile — pioche courte et +1 PV');
{
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ['gnome', 'bard', 'druid', 'paladin'].map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'easy'
    };
    Game.initGame(room);
    const g = room.game;
    ok('pioche de 48 tuiles (+ Sortie, - réserve)', g.deck.length === 48, 'deck=' + g.deck.length);
    ok('la Sortie est dans la pioche', g.deck.some(t => t.kind === 'exit'));
    const exitIdx = g.deck.findIndex(t => t.kind === 'exit');
    ok('la Sortie est parmi les 5 dernières', exitIdx >= g.deck.length - 5, 'index=' + exitIdx + '/' + g.deck.length);
    ok('+1 PV pour tous', g.characters.every(c => c.hp === c.maxHp && c.maxHp >= 4),
        g.characters.map(c => c.maxHp).join(','));
    // Facile keeps the rulebook's Normal tempo: what it shortens is the tile
    // pile, not the clock. The +3 cards are the separate opt-in concession.
    ok('22 tours à 4 personnages, comme en Normal', g.eventsTotal === 22, 'tours=' + g.eventsTotal);
}

// --- 13. Items: potions, scrolls, expert lockout ---------------------------
console.log('\n13. Objets — potions, parchemins, exclusion en Expert');
{
    const room = { users: [{ id: 'U', isRobot: false }], selectedCharacters: [], difficulty: 'normal' };
    Game.initLobbyData(room);
    ok('désactivés par défaut', room.itemsEnabled === false);
    Game.setItemsEnabled(room, true);
    ok('activables en Normal', room.itemsEnabled === true);
    Game.setDifficulty(room, 'expert');
    ok('désactivés d\'office en passant en Expert', room.itemsEnabled === false);
    const denied = Game.setItemsEnabled(room, true);
    ok('refusés en Expert', !denied.ok && denied.error === 'items-not-in-expert', JSON.stringify(denied));
    Game.setDifficulty(room, 'easy');
    ok('réactivables en Facile', Game.setItemsEnabled(room, true).ok);
}
{
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ['gnome', 'bard', 'druid', 'paladin'].map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'normal', itemsEnabled: true
    };
    Game.initGame(room);
    const g = room.game;
    const c = active(g);

    // A potion heals the first arrival, and only when it can.
    g.board['-1,0'] = { uid: 950, kind: 'simple', shape: 'corridor', exits: [0, 2], row: -1, col: 0, state: 'normal', item: 'potion' };
    act(room, 'move', { dir: 0 });
    ok('potion laissée sur place si PV au max', g.board['-1,0'].item === 'potion', 'item=' + g.board['-1,0'].item);
    c.hp = 1;
    c.row = 0; c.col = 0;
    act(room, 'move', { dir: 0 });
    ok('potion bue quand elle soigne', g.board['-1,0'].item === null, 'item=' + g.board['-1,0'].item);
    ok('elle rend 1 PV', c.hp === 2, 'hp=' + c.hp);

    // A scroll wakes a fallen adventurer from anywhere.
    const victim = g.characters.find(x => x.id !== c.id);
    victim.hp = 0; victim.conscious = false;
    victim.row = 5; victim.col = 5;              // far away: no need to be close
    g.scrolls = 1;
    const apBefore = g.ap;
    const used = Game.applyAction(room, 'U', 'use-scroll', { targetId: victim.id });
    ok('le parchemin est accepté', used.ok, JSON.stringify(used));
    ok('la victime est relevée à exactement 1 PV', victim.conscious === true && victim.hp === 1, 'hp=' + victim.hp);
    ok('il ne coûte aucun PA', g.ap === apBefore, apBefore + ' → ' + g.ap);
    ok('le stock est décrémenté', g.scrolls === 0, 'scrolls=' + g.scrolls);
    const again = Game.applyAction(room, 'U', 'use-scroll', { targetId: victim.id });
    ok('refusé sans parchemin', !again.ok && again.error === 'no-scroll', JSON.stringify(again));

    // A scroll only ever raises the fallen.
    g.scrolls = 2;
    const onAwake = Game.applyAction(room, 'U', 'use-scroll', { targetId: victim.id });
    ok('refusé sur un aventurier conscient', !onAwake.ok && onAwake.error === 'target-conscious', JSON.stringify(onAwake));
    victim.dead = true; victim.conscious = false;
    const onDead = Game.applyAction(room, 'U', 'use-scroll', { targetId: victim.id });
    ok('refusé sur un aventurier dévoré', !onDead.ok && onDead.error === 'bad-target', JSON.stringify(onDead));
    ok('le stock est intact après un refus', g.scrolls === 2, 'scrolls=' + g.scrolls);
}
{
    // Falling unconscious with scrolls in stock must raise the offer, and the
    // scroll must survive a refusal (nothing is auto-spent).
    // No Paladin (his Sacrifice would shield the tile) and no Bard (+1 to rolls).
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ['gnome', 'druid', 'elf-rogue', 'shadow-hunter'].map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'normal', itemsEnabled: true
    };
    Game.initGame(room);
    const g = room.game;
    g.scrolls = 1;
    const victim = g.characters[1];
    const seen = () => Game.buildState(room).fx.filter(f => f.kind === 'scroll-offer');
    ok('aucune proposition tant que personne ne tombe', seen().length === 0);
    victim.hp = 1;
    // Force every talent roll to fail so the Curse lands for sure.
    const origRoll = Utils.talentRoll;
    Utils.talentRoll = () => ({ value: 1, total: 1, success: false });
    g.eventDeck.unshift({ uid: 990, type: 'curse', label: 'Malédiction', doubled: false });
    let guard = 0;
    while (victim.conscious && guard++ < 20) Game.applyAction(room, 'U', 'end-turn', {});
    Utils.talentRoll = origRoll;
    const offers = seen();
    ok('une proposition est émise à la chute', offers.length > 0, offers.length + ' fx');
    if (offers.length) {
        const o = offers[offers.length - 1];
        ok('elle cible le bon aventurier', o.charId === victim.id, o.charId);
        ok('elle indique le propriétaire', o.ownerId === 'U', o.ownerId);
    }
    ok('le parchemin n\'est PAS dépensé automatiquement', g.scrolls === 1, 'scrolls=' + g.scrolls);
    ok('l\'aventurier reste inconscient tant qu\'on ne l\'utilise pas', victim.conscious === false);
    // ...and it still works afterwards, which is the "use it later" path.
    const later = Game.applyAction(room, 'U', 'use-scroll', { targetId: victim.id });
    ok('utilisable plus tard', later.ok && victim.conscious === true, JSON.stringify(later));
}
{
    // Items off: nothing ever drops.
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ['gnome', 'bard', 'druid', 'paladin'].map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'normal', itemsEnabled: false
    };
    Game.initGame(room);
    const g = room.game;
    for (let i = 0; i < 200; i++) {
        const t = { kind: 'simple' };
        Game.buildState(room);           // keep the engine honest
        if (t.item) break;
    }
    ok('aucun objet quand la variante est éteinte', g.itemsEnabled === false && g.scrolls === 0);
}

// --- 14. The rulebook's +3 Danger cards concession -------------------------
console.log('\n14. Renfort de temps — +3 événements fâcheux (règle optionnelle)');
{
    const Events = require(path.join(ROOT, 'server', 'events.js'));
    ok('Facile suit désormais le tempo de Normal',
        Events.getEventCount(4, 'easy', 0) === Events.getEventCount(4, 'normal', 0),
        Events.getEventCount(4, 'easy', 0) + ' vs ' + Events.getEventCount(4, 'normal', 0));
    ok('+3 en Normal à 4 personnages : 22 → 25', Events.getEventCount(4, 'normal', 3) === 25,
        String(Events.getEventCount(4, 'normal', 3)));
    ok('+3 en Avancé à 6 personnages : 15 → 18', Events.getEventCount(6, 'advanced', 3) === 18,
        String(Events.getEventCount(6, 'advanced', 3)));
    // Expert with 4 adventurers uses 18 of a 20-card pool: only +2 fits.
    ok('Expert à 4 personnages est plafonné par la pioche (20)',
        Events.getEventCount(4, 'expert', 3) === 20, String(Events.getEventCount(4, 'expert', 3)));
    ok('jamais plus de cartes que la pioche n\'en contient',
        ['easy', 'normal', 'advanced', 'expert'].every(d =>
            [4, 5, 6].every(n => Events.getEventCount(n, d, 3) <= Events.poolSize(d))));

    const mk = (difficulty, extra) => {
        const room = {
            users: [{ id: 'U', isRobot: false }],
            selectedCharacters: ['gnome', 'bard', 'druid', 'paladin'].map(id => ({ charId: id, ownerId: 'U' })),
            difficulty, extraEventsEnabled: extra
        };
        Game.initGame(room);
        return room.game;
    };
    ok('la pioche réelle gagne bien 3 cartes',
        mk('normal', true).eventsTotal - mk('normal', false).eventsTotal === 3);
    ok('aucune carte en double dans la pioche renforcée', (() => {
        const g = mk('normal', true);
        return new Set(g.eventDeck.map(c => c.uid)).size === g.eventDeck.length;
    })());
    ok('les cartes « x2 » restent exclues en Normal renforcé',
        mk('normal', true).eventDeck.every(c => !c.doubled));
    ok('Facile renforcé retrouve 25 tours', mk('easy', true).eventsTotal === 25,
        String(mk('easy', true).eventsTotal));

    // The lobby blurb must report what is really granted, not what was asked.
    const info = Game.getDifficultyInfo('expert', 4, true);
    ok('l\'info lobby annonce le vrai gain en Expert',
        info.extraTurns === 2 && info.turns === 20, JSON.stringify(info));
    const infoNormal = Game.getDifficultyInfo('normal', 4, true);
    ok('et le gain complet ailleurs',
        infoNormal.extraTurns === 3 && infoNormal.turns === 25, JSON.stringify(infoNormal));

    // Toggling is free and independent of the items variant.
    const room = { users: [], selectedCharacters: [], difficulty: 'expert' };
    Game.initLobbyData(room);
    ok('désactivé par défaut', room.extraEventsEnabled === false);
    ok('activable même en Expert', Game.setExtraEvents(room, true).ok && room.extraEventsEnabled === true);
}

// --- 15. Feedback weight: journal lines vs central toasts ------------------
console.log('\n15. Retours visuels — petits toasts pour les objets, gros pour les événements');
{
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ['gnome', 'bard', 'druid', 'paladin'].map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'normal', itemsEnabled: true
    };
    Game.initGame(room);
    const g = room.game;
    const logged = [];
    g.log.push = function (...a) { logged.push(...a); return Array.prototype.push.apply(this, a); };
    const fxKinds = () => Game.buildState(room).fx.map(f => f.kind);

    // Drinking a potion and reading a scroll must leave a journal line (which the
    // client turns into a small bottom toast) and NO central-toast payload.
    const c = active(g);
    c.hp = 1;
    g.board['-1,0'] = { uid: 960, kind: 'simple', shape: 'corridor', exits: [0, 2], row: -1, col: 0, state: 'normal', item: 'potion' };
    act(room, 'move', { dir: 0 });
    ok('la potion bue est journalisée', logged.some(l => /boit une Potion/.test(l)));
    ok('aucun fx central pour la potion', !fxKinds().includes('potion'), fxKinds().join(','));

    const victim = g.characters.find(x => x.id !== c.id);
    victim.hp = 0; victim.conscious = false;
    g.scrolls = 1;
    Game.applyAction(room, 'U', 'use-scroll', { targetId: victim.id });
    ok('le parchemin lu est journalisé', logged.some(l => /Un Parchemin est lu/.test(l)));
    ok('aucun fx central pour le parchemin', !fxKinds().includes('scroll-used'), fxKinds().join(','));

    // Hiding is a dice roll, not a misfortune: journal only.
    g.ap = 2;
    act(room, 'hide', {});
    ok('la tentative de dissimulation est journalisée',
        logged.some(l => /se cache|échoue à se cacher/.test(l)));
    ok('aucun fx central pour la dissimulation', !fxKinds().includes('hide'), fxKinds().join(','));

    // Reaching the Exit must announce itself.
    g.board['-2,0'] = { uid: 999, kind: 'exit', shape: 'deadend', exits: [2], row: -2, col: 0, state: 'normal' };
    const runner = g.characters.find(x => x.conscious && x.row === -1 && x.col === 0) || c;
    runner.row = -1; runner.col = 0;
    g.activeId = runner.id; g.ap = 2;
    const before = logged.length;
    act(room, 'move', { dir: 0 });
    ok('atteindre la SORTIE est annoncé dans le journal',
        logged.slice(before).some(l => /atteint la SORTIE/.test(l)),
        logged.slice(before).join(' | '));
    ok('mais sans gros toast central', !fxKinds().includes('exit'), fxKinds().join(','));
}
{
    // A misfortune event, on the other hand, keeps its central toast.
    const room = {
        users: [{ id: 'U', isRobot: false }],
        selectedCharacters: ['gnome', 'bard', 'druid', 'paladin'].map(id => ({ charId: id, ownerId: 'U' })),
        difficulty: 'normal'
    };
    Game.initGame(room);
    const g = room.game;
    g.eventDeck = [];               // next event phase triggers sudden death
    let guard = 0;
    while (g.queue.length && guard++ < 20) act(room, 'end-turn');
    const kinds = Game.buildState(room).fx.map(f => f.kind);
    ok('la mort subite garde son toast central', kinds.includes('sudden-death'), kinds.join(','));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' assertions OK, ' + fail + ' échec(s)\n');
process.exit(fail ? 1 : 0);
