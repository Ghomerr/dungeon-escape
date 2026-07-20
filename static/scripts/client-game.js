const Socket = io();
const Player = {};
const Game = { state: null };

let CELL = 84; // px per board cell

// Identity injected by the lobby form.
const params = new URLSearchParams(window.location.search);
Player.roomId = params.get('formRoomId');
Player.id = params.get('formUserId');
Player.token = params.get('formToken');

const OPP = (d) => (d + 2) % 4;
const DELTA = { 0: { r: -1, c: 0 }, 1: { r: 0, c: 1 }, 2: { r: 1, c: 0 }, 3: { r: 0, c: -1 } };

// A tile opens toward `dir` via a native exit OR a fireball breach. Breaches are
// stored apart from `exits` so the tile art never rotates when a wall is opened.
function tileOpensToward(tile, dir) {
    if (!tile) return false;
    if (tile.exits.includes(dir)) return true;
    return !!(tile.breaches && tile.breaches.includes(dir));
}

// --- Reference data --------------------------------------------------------

const TILE_INFO = {
    start: { icon: '🟢', label: 'Départ', desc: 'Tuile de départ des aventuriers, au centre du donjon.' },
    exit: { icon: '🚪', label: 'Sortie', desc: 'La sortie ! Les aventuriers ici sont immunisés et gagnent la partie.' },
    simple: { icon: '🔹', label: 'Couloir', desc: 'Tuile sans danger (couloir, coude, T ou carrefour).' },
    bridge: { icon: '🌉', label: 'Pont suspendu', desc: 'Entrée uniquement via « Marcher en équilibre » (2 PA). Gratuit via Explorer.' },
    'door-front': { icon: '🚪', label: 'Porte verrouillée (avant)', desc: 'Porte verrouillée vers l\'avant : impossible de découvrir / avancer au-delà tant qu\'elle est fermée.' },
    'door-back': { icon: '🚪', label: 'Porte verrouillée (arrière)', desc: 'Porte verrouillée vers l\'arrière : impossible de revenir en arrière tant qu\'elle est fermée.' },
    trap: { icon: '⚙️', label: 'Plaque piégée', desc: 'En y entrant : jet de talent, ou -1 PV en cas d\'échec.' },
    flammable: { icon: '🧨', label: 'Inflammable', desc: 'Prend feu lors de l\'événement Incendie selon le jet de dé (valeurs affichées).' },
    poisonable: { icon: '🤢', label: 'Nauséabonde', desc: 'Devient empoisonnée lors de l\'événement Poison (-2 PV), jusqu\'au prochain événement.' },
    gloom: { icon: '🌫️', label: 'Pénombre', desc: 'Devient Obscurité totale lors de l\'événement Obscurité.' },
    'dragon-lair': { icon: '🐲', label: 'Antre de dragon', desc: 'Un dragon peut surgir ici lors de l\'événement Dragon.' }
};
const STATE_INFO = {
    fire: { icon: '🔥', label: 'En feu', desc: 'Infranchissable. -3 PV (Pyromancien -1). À éteindre.' },
    poisoned: { icon: '☠️', label: 'Empoisonnée', desc: '-2 PV en entrant, jusqu\'au prochain événement.' },
    dark: { icon: '🌑', label: 'Obscurité totale', desc: 'Entrée uniquement via « Marcher dans l\'Obscurité » (2 PA).' }
};

// --- Tile art (PNG): tile -> image + rotation mapping -----------------------
// Images are drawn in ONE canonical orientation; we rotate them (0/90/180/270)
// via CSS to match the tile's real `exits`.
const ART_PATH = 'static/assets/tiles/';
const TILE_ART = {
    'simple|deadend': ['dead-end-1', 'dead-end-2'],
    'simple|corridor': ['corridor-1', 'corridor-2', 'corridor-3', 'corridor-4'],
    'simple|cross': ['crossroad-1', 'crossroad-2', 'crossroad-3'],
    'simple|tee': ['t-junction-1', 't-junction-2', 't-junction-3'],
    'simple|elbow': ['corner-1', 'corner-2', 'corner-3', 'corner-4'],
    'bridge|corridor': ['bridge-1', 'bridge-2', 'bridge-3'],
    'trap|cross': ['trap-1', 'trap-2', 'trap-3'],
    'poisonable|elbow': ['nauseous-corner-1', 'nauseous-corner-2', 'nauseous-corner-3', 'nauseous-corner-4', 'nauseous-corner-5', 'nauseous-corner-6'],
    'poisonable|tee': ['nauseous-t-1', 'nauseous-t-2'],
    'gloom|corridor': ['penumbra-corridor-1', 'penumbra-corridor-2', 'penumbra-corridor-3', 'penumbra-corridor-4'],
    'gloom|tee': ['penumbra-t-1', 'penumbra-t-2'],
    'gloom|cross': ['penumbra-crossroad-1', 'penumbra-crossroad-2'],
    'dragon-lair|deadend': ['dragon-deadend-1', 'dragon-deadend-2', 'dragon-deadend-3', 'dragon-deadend-4', 'dragon-deadend-5', 'dragon-deadend-6'],
    'dragon-lair|elbow': ['dragon-corner-1', 'dragon-corner-2'],
    'start|cross': ['entrance'],
    'exit|deadend': ['exit']
};
// Exits (dirs) as drawn in the base image, before rotation.
// Every image of a given shape is drawn in the SAME canonical orientation
// (elbows = NE, corridors = NS, T = ESW...), cf. tools/generate_tiles.py.
const ART_BASE_EXITS = { deadend: [0], corridor: [0, 2], elbow: [0, 1], tee: [1, 2, 3], cross: [0, 1, 2, 3] };

function artPick(list, uid) { const n = list.length; return list[(((uid || 0) % n) + n) % n]; }

function rotToMatch(baseExits, targetExits) {
    if (!targetExits || !targetExits.length) return 0;
    const tgt = targetExits.slice().sort((a, b) => a - b).join(',');
    for (let r = 0; r < 4; r++) {
        if (baseExits.map(e => (e + r) % 4).sort((a, b) => a - b).join(',') === tgt) return r;
    }
    return 0;
}

// Returns { file, rot } (rot in 0..3, quarter turns clockwise).
function tileArt(t) {
    // Locked / open doors : dedicated art, rotated so the door edge lands on doorDir.
    if (t.kind === 'door-front' || t.kind === 'door-back') {
        const style = ((((t.uid || 0) % 3) + 3) % 3) + 1;
        const fwd = t.kind === 'door-front';
        const file = (fwd ? 'door-forward-' : 'door-backward-') + style + (t.doorLocked ? '' : '-open');
        const baseDoor = fwd ? 0 : 2;   // door drawn at N (forward) / S (backward)
        const rot = (t.doorDir == null) ? 0 : (((t.doorDir - baseDoor) % 4) + 4) % 4;
        return { file: file, rot: rot };
    }
    let file, baseExits;
    if (t.kind === 'flammable') {
        const fv = (t.fireValues || []).join('');
        file = (t.shape === 'tee' ? 'flammable-t-' : 'flammable-corner-') + fv;
        baseExits = ART_BASE_EXITS[t.shape] || [0, 1];
    } else {
        const list = TILE_ART[t.kind + '|' + t.shape] || TILE_ART['simple|' + t.shape] || ['corridor-1'];
        file = artPick(list, t.uid);
        baseExits = (t.kind === 'exit') ? [2] : (ART_BASE_EXITS[t.shape] || [0, 2]);
    }
    return { file: file, rot: rotToMatch(baseExits, t.exits) };
}

// --- Adventurer portraits ---------------------------------------------------
// Files are named after the character id: static/assets/adventurers/<id>.png
function portraitUrl(id) { return 'static/assets/adventurers/' + id + '.png'; }

const EVENT_INFO = {
    fire: { icon: '🔥', desc: 'Un jet de dé désigne les tuiles inflammables qui prennent feu (-3 PV ; Pyromancien -1).' },
    curse: { icon: '🌀', desc: 'Chaque aventurier conscient fait un jet de talent ; en cas d\'échec : -1 PV.' },
    poison: { icon: '☠️', desc: 'Les tuiles nauséabondes deviennent empoisonnées (-2 PV), jusqu\'au prochain événement.' },
    dragon: { icon: '🐉', desc: 'Les dragons présents se déplacent vers l\'aventurier le plus proche, puis un nouveau dragon apparaît (max 3).' },
    gloom: { icon: '🌑', desc: 'Les tuiles pénombre deviennent Obscurité totale (-1 PV à ceux qui s\'y trouvent).' },
    'sudden-death': { icon: '💀', desc: 'Le temps est écoulé : chaque aventurier encore dans le donjon fait un jet de talent ; échec = éliminé.' }
};

const ACTION_ICON = {
    discover: '🧱', explore: '🧭', move: '👣', run: '🏃', heal: '➕',
    'walk-dark': '🌑', 'walk-bridge': '🌉', extinguish: '🧯', 'pick-lock': '🗝️', hide: '🙈'
};
const ABILITY_ICON = {
    'flame-mastery': '🧯', 'apply-balm': '🌿', 'animal-celerity': '🐾', 'lockpicking': '🗝️',
    'slay-dragon': '⚔️', 'inspiration': '🎵', 'fireball': '💥', 'shadow-walk': '🌑',
    'night-vision': '👁️', 'strategic-retreat': '🔄', 'stealth': '🙈', 'rock-memory': '🪨',
    'fire-resist': '🔥', 'elven-agility': '🤸', 'luck': '🍀', 'sacrifice': '🛡️'
};

const BASE_ACTIONS = [
    { action: 'discover', label: 'Découvrir', cost: 1, mode: 'dir', tip: 'Pioche une tuile et la place sur une tuile adjacente connectée (choix de l\'orientation).' },
    { action: 'move', label: 'Se déplacer', cost: 1, mode: 'dir', tip: 'Déplace l\'aventurier sur une tuile adjacente connectée.' },
    { action: 'explore', label: 'Explorer', cost: 1, mode: 'dir', tip: 'Découvre une tuile ET entre dessus en une seule action.' },
    { action: 'run', label: 'Courir', cost: 2, mode: 'none', tip: 'Donne 3 déplacements à dépenser ce tour (2 PA).' },
    { action: 'heal', label: 'Soigner', cost: 2, mode: 'sameTile', tip: 'Soigne 1 PV, sur soi ou un aventurier de la même tuile.' }
];
const DUNGEON_ACTIONS = [
    { action: 'walk-dark', label: 'Marcher dans l\'Obscurité', cost: 2, mode: 'dir', tip: 'Seul moyen d\'entrer sur une tuile Obscurité totale.' },
    { action: 'walk-bridge', label: 'Marcher en équilibre', cost: 2, mode: 'dir', tip: 'Seul moyen d\'entrer sur un Pont suspendu.' },
    { action: 'extinguish', label: 'Éteindre un incendie', cost: 2, mode: 'dirHere', tip: 'Éteint le feu sur sa tuile ou une tuile adjacente.' },
    { action: 'pick-lock', label: 'Crocheter une porte', cost: 2, mode: 'none', tip: 'Ouvre la porte verrouillée de votre tuile (jet de talent ; le kit n\'est consommé qu\'en cas de réussite).' },
    { action: 'hide', label: 'Se cacher', cost: 2, mode: 'none', tip: 'Ne plus être ciblé par les dragons ce tour (jet de talent ; auto au 3e essai d\'affilée).' }
];
const ABILITY_MODE = {
    'flame-mastery': 'dirHere', 'apply-balm': 'otherSameTile', 'animal-celerity': 'none',
    'lockpicking': 'none', 'slay-dragon': 'none', 'inspiration': 'otherAny',
    'fireball': 'dir', 'shadow-walk': 'shadowDest'
};

// --- Bootstrap -------------------------------------------------------------

$(document).ready(() => {
    if (!Player.roomId || !Player.id || !Player.token) { window.location.href = '/'; return; }

    $('#simple-dialog').dialog({ modal: true, autoOpen: false });
    $('#dir-dialog').dialog({ modal: true, autoOpen: false, width: 260 });
    $('#choice-dialog').dialog({ modal: true, autoOpen: false, width: 300 });
    $('#placement-dialog').dialog({ modal: true, autoOpen: false, width: 430 });

    Socket.emit('join-game', { roomId: Player.roomId, userId: Player.id, token: Player.token });

    $('#endturn-btn').click(() => {
        // Warn before ending the turn while action points are still available.
        if (isMyTurn() && state && state.ap > 0) {
            const ac = activeChar();
            Dialog.openTwoChoicesDialog($('#simple-dialog'), '⏭️ Terminer le tour',
                'Il reste encore <b>' + state.ap + ' PA</b>' + (state.freeMoves ? ' (+' + state.freeMoves + ' dépl.)' : '') +
                ' à ' + escapeHtml(ac ? ac.name : 'cet aventurier') + '. Terminer le tour quand même ?',
                'Terminer le tour', () => sendAction('end-turn', {}), 'Continuer à jouer', null);
            return;
        }
        sendAction('end-turn', {});
    });
    $('#effort-btn').click(() => sendAction('effort', {}));

    $('#game-emoji-bar').on('click', '.emoji-send', function () {
        Socket.emit('send-emoji', { roomId: Player.roomId, userId: Player.id, emoji: $(this).data('emoji') });
    });

    $('#end-leave').click(() => {
        Socket.emit('player-disconnect', { userId: Player.id, roomId: Player.roomId, token: Player.token });
        window.location.href = '/';
    });

    // Host-only : end a paused game right away.
    $('#pause-end-btn').click(() => {
        Socket.emit('end-game-early', { roomId: Player.roomId, ownerId: Player.id, token: Player.token });
    });
});

window.addEventListener('beforeunload', () => {
    Socket.emit('player-disconnect', { userId: Player.id, roomId: Player.roomId, token: Player.token });
});

// --- Socket events ---------------------------------------------------------

Socket.on('ready-players-amount', (d) => { $('#waiting-sub').hide(); $('#pause-end-btn').hide(); $('#waiting-text').text(d.readyPlayersAmout + ' / ' + d.totalPlayers + ' joueurs prêts…'); });
Socket.on('all-players-ready-to-play', () => $('#waiting-overlay').fadeOut(300));

function showPauseOverlay(d) {
    const names = (d.missingNames && d.missingNames.length) ? d.missingNames.join(', ') : (d.missingPlayers + ' joueur(s)');
    $('#waiting-text').text('⏸️ Partie en pause — en attente de : ' + names);
    $('#waiting-sub').show();
    $('#pause-end-btn').toggle(d.owner === Player.id);
    $('#waiting-overlay').stop(true, true).fadeIn(150);
}
function hidePauseOverlay() { $('#pause-end-btn').hide(); $('#waiting-overlay').fadeOut(200); }

Socket.on('player-left-the-room', (d) => showPauseOverlay(d));
Socket.on('in-game-player-connected', (d) => { if (d.missingPlayers === 0) hidePauseOverlay(); else showPauseOverlay(d); });
Socket.on('game-aborted', (d) => {
    const msg = d && d.reason === 'host-ended'
        ? 'L\'hôte a mis fin à la partie.'
        : 'La partie a été fermée après une trop longue absence.';
    Dialog.openSimpleDialog($('#simple-dialog'), '🏁 Partie terminée', msg);
    setTimeout(() => { window.location.href = '/'; }, 1800);
});
Socket.on('join-game-error', () => { window.location.href = '/'; });

Socket.on('game-error', (data) => {
    const M = {
        'not-your-turn': 'Ce n\'est pas votre tour.', 'no-ap': 'Pas assez de points d\'action.',
        'no-connection': 'Aucun couloir ne connecte ces tuiles.', 'no-tile': 'Aucune tuile dans cette direction.',
        'occupied': 'Une tuile occupe déjà cet emplacement.', 'empty-deck': 'La pioche est vide.',
        'no-exit-here': 'Pas de couloir dans cette direction.', 'door-blocks': 'Une porte verrouillée bloque ce passage.',
        'need-bridge-action': 'Utilisez « Marcher en équilibre » pour un pont.', 'need-dark-action': 'Utilisez « Marcher dans l\'Obscurité ».',
        'fire-blocks': 'Un incendie bloque le passage (éteignez-le).', 'not-same-tile': 'La cible doit être sur la même tuile.',
        'full-hp': 'Cette cible a déjà tous ses PV.', 'not-on-fire': 'Cette tuile n\'est pas en feu.',
        'no-door': 'Aucune porte verrouillée sur votre tuile.', 'no-kits': 'Plus de kits de crochetage.',
        'no-adjacent-dragon': 'Aucun dragon adjacent.', 'no-fireball-left': 'Plus de boule de feu disponible.',
        'not-on-shadow': 'Vous devez être sur une tuile Pénombre / Obscurité.', 'bad-destination': 'Destination invalide.',
        'unconscious': 'Cet aventurier est inconscient.', 'finish-placement': 'Terminez d\'abord le placement de la tuile.',
        'no-mulligan-left': 'Plus de Repli stratégique disponible.',
        'run-move-only': 'Pendant une course / célérité, seul le déplacement est possible.',
        'nothing-to-cancel': 'Rien à annuler (le déplacement a déjà commencé).'
    };
    if (data.error && M[data.error]) Dialog.openSimpleDialog($('#simple-dialog'), '⛔ Action impossible', M[data.error]);
});

Socket.on('emoji', (data) => {
    const $b = $('#game-emoji-bubble');
    $b.text(data.from + ' ' + data.emoji).stop(true, true).css('opacity', 1);
    clearTimeout(Game._emojiTimer);
    Game._emojiTimer = setTimeout(() => $b.fadeTo(600, 0, () => $b.text('').css('opacity', 1)), 2500);
});

Socket.on('game-state', (state) => { Game.state = state; render(state); });

// --- Helpers ---------------------------------------------------------------

function sendAction(action, payload) {
    Socket.emit('game-action', { roomId: Player.roomId, userId: Player.id, token: Player.token, action, payload: payload || {} });
}
function isMyTurn() { return Game.state && Game.state.activeOwnerId === Player.id && Game.state.status === 'PLAYING'; }
function activeChar() { return Game.state ? Game.state.characters.find(c => c.id === Game.state.activeId) : null; }
function cellKey(r, c) { return r + ',' + c; }
function tileAt(r, c) { return Game.state.board[cellKey(r, c)]; }

// --- Dialogs ---------------------------------------------------------------

function openDirPicker(opts, cb) {
    const $d = $('#dir-dialog');
    $d.dialog('option', 'title', (opts && opts.title) || 'Choisir une direction');
    $d.find('.dir-here').toggle(!!(opts && opts.here));
    $d.find('.dir-btn').off('click').on('click', function () {
        const raw = $(this).data('dir');
        $d.dialog('close');
        cb(raw === 'here' ? 'here' : parseInt(raw, 10));
    });
    $d.dialog('option', 'buttons', [{ text: 'Annuler', click: () => $d.dialog('close') }]);
    $d.dialog('open');
}

// items: [{ label, fn }]
function openMenu(title, items) {
    const $d = $('#choice-dialog');
    const $list = $d.find('.choice-list').empty();
    items.forEach(it => {
        const $b = $('<button class="choice-btn">' + it.label + '</button>');
        $b.click(() => { $d.dialog('close'); it.fn(); });
        $list.append($b);
    });
    $d.dialog('option', 'title', title);
    $d.dialog('option', 'buttons', [{ text: 'Annuler', click: () => $d.dialog('close') }]);
    $d.dialog('open');
}

// --- Action modes (for side buttons) ---------------------------------------

function runActionMode(mode, def, isAbility) {
    const ac = activeChar();
    const emit = (payload) => {
        if (isAbility) { payload.abilityId = def.abilityId; sendAction('ability', payload); }
        else sendAction(def.action, payload);
    };
    switch (mode) {
        case 'none': emit({}); break;
        case 'dir': openDirPicker({ title: def.label }, (dir) => emit({ dir })); break;
        case 'dirHere': openDirPicker({ title: def.label, here: true }, (dir) => emit(dir === 'here' ? {} : { dir })); break;
        case 'sameTile': {
            const cands = Game.state.characters.filter(c => !c.escaped && !c.dead && c.row === ac.row && c.col === ac.col);
            if (!cands.length) return;
            // Alone on the tile : heal oneself immediately, no target menu.
            if (cands.length === 1) { emit({ targetId: cands[0].id }); return; }
            openMenu('Soigner qui ?', cands.map(c => ({ label: c.emoji + ' ' + c.name + ' (' + c.hp + '/' + c.maxHp + ')', fn: () => emit({ targetId: c.id }) })));
            break;
        }
        case 'otherSameTile': {
            const cands = Game.state.characters.filter(c => c.id !== ac.id && !c.escaped && !c.dead && c.row === ac.row && c.col === ac.col);
            if (!cands.length) { Dialog.openSimpleDialog($('#simple-dialog'), 'Aucune cible', 'Aucun autre aventurier sur cette tuile.'); return; }
            openMenu('Cible', cands.map(c => ({ label: c.emoji + ' ' + c.name, fn: () => emit({ targetId: c.id }) })));
            break;
        }
        case 'otherAny': {
            const cands = Game.state.characters.filter(c => c.id !== ac.id && !c.escaped && !c.dead && c.conscious);
            if (!cands.length) return;
            openMenu('Inspirer quel aventurier ?', cands.map(c => ({ label: c.emoji + ' ' + c.name + ' (' + c.ownerId + ')', fn: () => emit({ targetId: c.id }) })));
            break;
        }
        case 'shadowDest': {
            const cells = Object.keys(Game.state.board).filter(k => {
                const t = Game.state.board[k];
                return (t.kind === 'gloom' || t.state === 'dark') && !(t.row === ac.row && t.col === ac.col);
            });
            if (!cells.length) { Dialog.openSimpleDialog($('#simple-dialog'), 'Aucune destination', 'Aucune autre tuile Pénombre / Obscurité.'); return; }
            openMenu('Réapparaître sur…', cells.map(k => {
                const t = Game.state.board[k];
                return { label: (TILE_INFO[t.kind] || {}).icon + ' ' + (TILE_INFO[t.kind] || {}).label + ' (' + k + ')', fn: () => emit({ destCell: k }) };
            }));
            break;
        }
    }
}

// --- Board click interaction -----------------------------------------------

function dirBetween(fromR, fromC, toR, toC) {
    const dr = toR - fromR, dc = toC - fromC;
    if (dr === 0 && dc === 0) return 'here';
    for (let d = 0; d < 4; d++) if (DELTA[d].r === dr && DELTA[d].c === dc) return d;
    return null;
}

function edgeConnected(fromTile, dir, toTile) {
    if (!fromTile || !toTile) return false;
    if (!tileOpensToward(fromTile, dir) || !tileOpensToward(toTile, OPP(dir))) return false;
    // One-way doors: a locked door only blocks leaving its own tile through the
    // door edge. You can always step onto a door tile (mirrors server edgeConnected).
    if (fromTile.doorLocked && fromTile.doorDir === dir) return false;
    return true;
}

function tileFullLabel(tile) {
    const base = TILE_INFO[tile.kind] || { icon: '', label: tile.kind, desc: '' };
    // When a tile suffers a bad state (fire, poison, darkness), that state takes
    // priority in the title (e.g. "Obscurité totale" rather than "Pénombre").
    const st = (tile.state && tile.state !== 'normal' && STATE_INFO[tile.state]) ? STATE_INFO[tile.state] : null;
    let txt = st ? (st.icon + ' ' + st.label) : (base.icon + ' ' + base.label);
    if (tile.doorLocked) txt += ' 🔒 (verrouillée)';
    const desc = st ? st.desc : base.desc;
    return txt + '\n' + desc;
}

// Show the tile description in the permanent panel (above the action buttons).
function showTileDesc(tile) {
    const parts = tileFullLabel(tile).split('\n');
    $('#tile-desc').removeClass('tile-desc-empty').html(
        '<div class="td-title">' + escapeHtml(parts[0]) + '</div>' +
        '<div class="td-body">' + escapeHtml(parts[1] || '') + '</div>');
}

// Dangers that make the active character lose HP just by entering `tile`
// (see server enterTile). Returns a list of HTML warning lines.
function moveDangerWarnings(tile, ac) {
    const warns = [];
    const immune = ac.abilities && ac.abilities.some(a => a.id === 'stealth');
    if (!immune && state.dragons && state.dragons.some(d => d.row === tile.row && d.col === tile.col)) {
        warns.push('🐉 Un <b>Dragon</b> occupe cette tuile : ' + escapeHtml(ac.name) + ' sera <b>terrassé</b> (0 PV, inconscient).');
    }
    if (tile.state === 'poisoned') {
        warns.push('☠️ Tuile <b>empoisonnée</b> : −2 PV (sauf protection du Paladin).');
    }
    if (tile.kind === 'trap') {
        warns.push('⚙️ <b>Plaque piégée</b> : jet de talent raté = −1 PV.');
    }
    return warns;
}

// Run `doIt` (the actual move), but if the destination is dangerous, ask the
// player to confirm first, recalling the hazard(s) awaiting the adventurer.
function moveWithConfirm(tile, ac, doIt) {
    const warns = moveDangerWarnings(tile, ac);
    if (!warns.length) { doIt(); return; }
    const body = escapeHtml(ac.name) + ' va entrer sur cette tuile :' +
        '<ul><li>' + warns.join('</li><li>') + '</li></ul>Confirmer le déplacement ?';
    Dialog.openTwoChoicesDialog($('#simple-dialog'), '⚠️ Déplacement dangereux', body,
        'Se déplacer quand même', doIt, 'Annuler', null);
}

function onTileClick(tile) {
    showTileDesc(tile);
    if (!isMyTurn()) return;
    const ac = activeChar();
    if (!ac || !ac.conscious) return;
    const dir = dirBetween(ac.row, ac.col, tile.row, tile.col);
    const here = tileAt(ac.row, ac.col);
    const items = [];

    // A locked door is always picked from the tile you stand on (any direction).
    const canPickHere = here.doorLocked;

    if (dir === 'here') {
        if (tile.state === 'fire') items.push({ label: '🧯 Éteindre l\'incendie (2 PA)', fn: () => sendAction('extinguish', {}) });
        if (canPickHere) items.push({ label: '🗝️ Crocheter la porte (2 PA)', fn: () => sendAction('pick-lock', {}) });
    } else if (dir !== null) {
        const connected = edgeConnected(here, dir, tile);
        // Our own door blocks leaving this way : offer to pick it (from here).
        const blockedByOwnDoor = here.doorLocked && here.doorDir === dir;
        const sameAxisExit = tileOpensToward(here, dir) && tileOpensToward(tile, OPP(dir));

        if (tile.state === 'fire') {
            items.push({ label: '🧯 Éteindre l\'incendie (2 PA)', fn: () => sendAction('extinguish', { dir }) });
            if (ac.abilities.some(a => a.id === 'elven-agility')) items.push({ label: '🤸 Entrer (Agilité elfique, 1 PA)', fn: () => moveWithConfirm(tile, ac, () => sendAction('move', { dir })) });
        } else if (tile.kind === 'bridge' && connected) {
            items.push({ label: '🌉 Marcher en équilibre (2 PA)', fn: () => sendAction('walk-bridge', { dir }) });
        } else if (tile.state === 'dark' && sameAxisExit) {
            if (ac.abilities.some(a => a.id === 'night-vision')) items.push({ label: '👣 Se déplacer (Vision nocturne)', fn: () => moveWithConfirm(tile, ac, () => sendAction('move', { dir })) });
            else items.push({ label: '🌑 Marcher dans l\'Obscurité (2 PA)', fn: () => sendAction('walk-dark', { dir }) });
        } else if (connected) {
            items.push({ label: '👣 Se déplacer ici (1 PA)', fn: () => moveWithConfirm(tile, ac, () => sendAction('move', { dir })) });
        }
        if (blockedByOwnDoor) items.push({ label: '🗝️ Crocheter la porte qui bloque ce passage (2 PA)', fn: () => sendAction('pick-lock', {}) });
    }

    // The description is already shown permanently (#tile-desc panel), so the
    // menu only contains actions.
    if (!items.length) return;
    if (items.length === 1) { items[0].fn(); return; }
    openMenu('Tuile ' + (TILE_INFO[tile.kind] || {}).label, items);
}

function onGhostClick(row, col, dir) {
    if (!isMyTurn()) return;
    const ac = activeChar();
    if (!ac || !ac.conscious) return;
    openMenu('Emplacement à explorer', [
        { label: '🧭 Explorer (découvrir + entrer, 1 PA)', fn: () => sendAction('explore', { dir }) },
        { label: '🧱 Découvrir (placer la tuile, 1 PA)', fn: () => sendAction('discover', { dir }) }
    ]);
}

// --- Rendering -------------------------------------------------------------

// Ambient colour of each event (for the central toast).
const EVENT_COLORS = {
    fire: '#b83a1c', curse: '#6c3fb5', poison: '#4c8f2a',
    dragon: '#8b1a1a', gloom: '#2a2f6b', 'sudden-death': '#1a1a1a'
};

// Large central toast shown when a bad event occurs.
function showEventToast(ev) {
    const info = EVENT_INFO[ev.type] || { icon: '🎴' };
    const $t = $('#event-toast');
    $t[0].style.setProperty('--toast-color', EVENT_COLORS[ev.type] || '#333');
    $t.html('<span class="toast-icon">' + info.icon + '</span><span class="toast-label">' +
        escapeHtml(ev.label || '') + '</span>');
    $t.stop(true, true).css({ display: 'flex', opacity: 0 }).animate({ opacity: 1 }, 220);
    clearTimeout(Game._toastTimer);
    Game._toastTimer = setTimeout(() => $t.animate({ opacity: 0 }, 500, () => $t.css('display', 'none')), 3200);
}

function maybeShowEventToast(state) {
    const n = state.eventsResolved || 0;
    if (Game._lastEvents === undefined) { Game._lastEvents = n; Game._sudden = state.suddenDeath; return; }
    if (n > Game._lastEvents && state.currentEvent) {
        showEventToast(state.currentEvent);
    } else if (state.suddenDeath && !Game._sudden) {
        showEventToast({ type: 'sudden-death', label: 'Mort subite' });
    }
    Game._lastEvents = n;
    Game._sudden = state.suddenDeath;
}

function render(state) {
    maybeShowEventToast(state);
    if (state.status !== 'PLAYING') renderEnd(state);
    renderHeader(state);
    renderParty(state);
    renderEvent(state);
    renderBoard(state);
    renderActions(state);
    renderLog(state);
    renderPlacement(state);
    $('#kit-count').text(state.lockpickKits);
    $('#deck-count').text(state.deckLeft);
}

function renderHeader(state) {
    const ac = activeChar();
    let info = 'Tour ' + state.round;
    if (ac) {
        info += ' · À ' + (ac.ownerId === Player.id ? 'VOUS' : ac.ownerId) + ' : ' + ac.name +
            ' — ' + state.ap + ' PA' + (state.freeMoves ? ' (+' + state.freeMoves + ' dépl.)' : '');
        if (state.interrupt) info += ' ⚡ action immédiate';
        if (state.turnTotal) {
            const pos = state.turnTotal - state.turnRemaining + 1;
            const left = state.turnRemaining - 1; // adventurers still waiting after the active one
            info += ' · Aventurier ' + pos + '/' + state.turnTotal +
                (left > 0 ? ' (' + left + ' après lui)' : ' (dernier du tour)');
        }
    }
    $('#turn-info').text(info);
    if (state.suddenDeath) $('#turns-left').html('<span class="sudden">💀 MORT SUBITE</span>');
    else $('#turns-left').text('Tours restants : ' + state.turnsLeft);
    if (state.dragons.length) $('#dragon-marker').show().text('🐉 ×' + state.dragons.length + ' dans le donjon');
    else $('#dragon-marker').hide();
}

function renderParty(state) {
    const $list = $('#party-list').empty();

    // List adventurers in the round's play order (rotation starting at the
    // current first player) so it's easy to see who plays next and when the
    // round ends. Falls back to the raw list if order data is missing.
    const order = state.order || state.characters.map(c => c.id);
    const start = state.firstIndex || 0;
    const ordered = [];
    for (let i = 0; i < order.length; i++) {
        const c = state.characters.find(x => x.id === order[(start + i) % order.length]);
        if (c && ordered.indexOf(c) === -1) ordered.push(c);
    }
    state.characters.forEach(c => { if (ordered.indexOf(c) === -1) ordered.push(c); });

    ordered.forEach(c => {
        let status = '';
        if (c.escaped) status = '<span class="tag escaped">échappé</span>';
        else if (c.dead) status = '<span class="tag dead">mort</span>';
        else if (!c.conscious) status = '<span class="tag ko">inconscient</span>';
        else if (c.hidden) status = '<span class="tag hidden">caché</span>';
        const hpBar = '<div class="hp-bar"><div class="hp-fill" style="width:' + (c.maxHp ? (100 * c.hp / c.maxHp) : 0) + '%"></div></div>';
        const isActive = c.id === state.activeId;
        const active = isActive ? ' active' : '';
        const arrow = isActive ? '<span class="active-arrow"></span>' : '';
        // Action points : only the active adventurer currently has any, so show
        // the line (like the HP line) only on that card.
        const apRow = isActive
            ? '<div class="pc-ap">⚡ ' + state.ap + ' PA' +
              (state.freeMoves ? ' <span class="pc-free">(+' + state.freeMoves + ' dépl.)</span>' : '') + '</div>'
            : '';
        $list.append('<div class="party-card' + active + '" style="border-color:' + c.color + '">' + arrow +
            '<div class="pc-portrait" style="background-image:url(' + portraitUrl(c.id) + ');border-color:' + c.color + '"></div>' +
            '<div class="pc-info">' +
            '<div class="pc-name-row"><span class="pc-name">' + c.name + '</span>' +
            '<span class="pc-level" title="Niveau — les dragons ciblent en priorité le niveau le plus bas">Niv. ' + c.level + '</span>' +
            status + '</div>' +
            '<div class="pc-hp">' + c.hp + '/' + c.maxHp + ' PV ' + hpBar + '</div>' +
            apRow +
            '<div class="pc-owner">👤 ' + c.ownerId + '</div></div></div>');
    });
}

function renderEvent(state) {
    const e = state.currentEvent;
    if (!e) { $('#event-content').html('<span class="muted">Aucun événement pour l\'instant.</span>'); return; }
    const info = EVENT_INFO[e.type] || { icon: '🎴', desc: '' };
    $('#event-content').html('<div class="event-head"><span class="event-icon">' + info.icon + '</span> <b>' + e.label + '</b></div>' +
        '<div class="event-desc">' + info.desc + '</div>' +
        (e.type === 'poison' ? '<div class="hint">Actif jusqu\'à la prochaine phase d\'événement.</div>' : ''));
}

function renderLog(state) {
    const $log = $('#log').empty();
    state.log.slice().reverse().forEach(line => $log.append('<div class="log-line">' + escapeHtml(line) + '</div>'));
}
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Slide a token from its previous cell to its new one (~1s) so the move is
// visible. `key` identifies the token (character or dragon).
function animateIfMoved($tok, $tile, key, row, col, prevPos, curPos) {
    curPos[key] = { row, col };
    const prev = prevPos[key];
    if (!prev || (prev.row === row && prev.col === col)) return;
    const dr = prev.row - row, dc = prev.col - col;
    const el = $tok[0], tileEl = $tile[0];
    // Start from the previous cell; let the token overflow the tile during the slide.
    el.style.transition = 'none';
    el.style.transform = 'translate(' + (dc * CELL) + 'px,' + (dr * CELL) + 'px)';
    el.style.zIndex = '30';
    tileEl.style.overflow = 'visible';
    tileEl.style.zIndex = '20';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'transform 1s ease';
        el.style.transform = 'translate(0,0)';
    }));
    setTimeout(() => {
        el.style.transition = ''; el.style.transform = ''; el.style.zIndex = '';
        tileEl.style.overflow = ''; tileEl.style.zIndex = '';
    }, 1100);
}

function renderBoard(state) {
    const board = state.board;
    const keys = Object.keys(board);
    const prevPos = Game._tokenPos || {};
    const curPos = {};
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    keys.forEach(k => { const t = board[k]; minR = Math.min(minR, t.row); maxR = Math.max(maxR, t.row); minC = Math.min(minC, t.col); maxC = Math.max(maxC, t.col); });

    // Ghost (discoverable) cells around the active character's tile.
    const ghosts = [];
    const ac = activeChar();
    // No discovery/exploration ghosts while running (only movement is allowed then).
    if (ac && isMyTurn() && ac.conscious && !state.pending && !(state.freeMoves > 0)) {
        const here = board[cellKey(ac.row, ac.col)];
        if (here) {
            for (let dir = 0; dir < 4; dir++) {
                if (!tileOpensToward(here, dir)) continue;
                if (here.doorLocked && here.doorDir === dir) continue;
                const nr = ac.row + DELTA[dir].r, nc = ac.col + DELTA[dir].c;
                if (board[cellKey(nr, nc)]) continue;
                ghosts.push({ row: nr, col: nc, dir });
                minR = Math.min(minR, nr); maxR = Math.max(maxR, nr); minC = Math.min(minC, nc); maxC = Math.max(maxC, nc);
            }
        }
    }

    const rows = maxR - minR + 1, cols = maxC - minC + 1;
    const $board = $('#board').empty();
    $board.css({ width: cols * CELL + 'px', height: rows * CELL + 'px' });

    keys.forEach(k => {
        const t = board[k];
        const $tile = $('<div></div>')
            .addClass('tile kind-' + t.kind + ' state-' + t.state + (t.doorLocked ? ' door-locked' : ''))
            .css({ top: (t.row - minR) * CELL + 'px', left: (t.col - minC) * CELL + 'px', width: CELL + 'px', height: CELL + 'px' })
            .attr('title', tileFullLabel(t));

        // Image layer (rotated): the PNG carries floor, walls, connectors and decor.
        const art = tileArt(t);
        $tile.append($('<div class="tile-art"></div>').css({
            'background-image': 'url(' + ART_PATH + art.file + '.png)',
            'transform': 'rotate(' + (art.rot * 90) + 'deg)'
        }));

        // Fireball breach overlay(s): a blasted opening drawn on top of the tile,
        // rotated toward the breach edge (canonical art points North / dir 0).
        (t.breaches || []).forEach(bd => {
            $tile.append($('<div class="tile-breach"></div>').css({
                'background-image': 'url(' + ART_PATH + 'breach.png)',
                'transform': 'rotate(' + (bd * 90) + 'deg)'
            }));
        });

        // State layer (bad event): coloured veil + icon, on top of the image.
        if (t.state && t.state !== 'normal' && STATE_INFO[t.state]) {
            $tile.append('<div class="state-fx fx-' + t.state + '"></div>');
            $tile.append('<div class="state-icon">' + STATE_INFO[t.state].icon + '</div>');
        }

        // Dice values (flammable): HTML overlay, always upright and legible.
        if (t.kind === 'flammable' && t.fireValues) {
            $tile.append('<div class="fire-values">' + t.fireValues.join('·') + '</div>');
        }

        state.dragons.filter(d => d.row === t.row && d.col === t.col).forEach(d => {
            const $tok = $('<span class="token dragon-token">🐉</span>');
            $tile.append($tok);
            animateIfMoved($tok, $tile, 'd' + d.id, d.row, d.col, prevPos, curPos);
        });
        state.characters.filter(c => !c.escaped && !c.dead && c.row === t.row && c.col === t.col).forEach(c => {
            const koCls = c.conscious ? '' : ' ko';
            // Active token aura reflects the remaining action points :
            //  - blinking white while AP remain, steady once empty ;
            //  - red (overreach) after an Effort, steady red once empty.
            let activeCls = '';
            if (c.id === state.activeId) {
                activeCls = ' tok-active';
                if (state.effortUsed) activeCls += ' aura-overreach';
                if (state.ap <= 0) activeCls += ' aura-empty';
            }
            const $tok = $('<span class="token char-token' + koCls + activeCls + '" style="background-image:url(' + portraitUrl(c.id) + ');border-color:' + c.color + '" title="' + c.name + ' (' + c.hp + '/' + c.maxHp + ')"></span>');
            $tile.append($tok);
            animateIfMoved($tok, $tile, 'c' + c.id, c.row, c.col, prevPos, curPos);
        });

        $tile.click(() => onTileClick(t));
        $board.append($tile);
    });

    ghosts.forEach(g => {
        const $gh = $('<div class="tile ghost-cell" title="Explorer / découvrir ici"></div>')
            .css({ top: (g.row - minR) * CELL + 'px', left: (g.col - minC) * CELL + 'px', width: CELL + 'px', height: CELL + 'px' })
            .append('<div class="ghost-plus">+</div>');
        $gh.click(() => onGhostClick(g.row, g.col, g.dir));
        $board.append($gh);
    });

    Game._tokenPos = curPos;

    // When a new adventurer becomes active (turn start), scroll the board so
    // that adventurer is centred in the viewport.
    if (state.activeId && state.activeId !== Game._scrolledActiveId) {
        Game._scrolledActiveId = state.activeId;
        setTimeout(() => {
            const el = document.querySelector('#board .tok-active');
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        }, 60);
    }
}

function miniTilePreview(cand, exits) {
    const isDoor = cand.kind === 'door-front' || cand.kind === 'door-back';
    const t = {
        kind: cand.kind, shape: cand.shape, exits: exits, uid: cand.uid || 0,
        fireValues: cand.fireValues || null,
        doorLocked: isDoor,
        doorDir: isDoor && exits && exits.length ? exits[0] : null
    };
    const art = tileArt(t);
    return '<div class="mini-tile"><div class="mini-art" style="background-image:url(' + ART_PATH + art.file +
        '.png);transform:rotate(' + (art.rot * 90) + 'deg)"></div></div>';
}

function renderPlacement(state) {
    const $d = $('#placement-dialog');
    const p = state.pending;
    if (!p) { Game._autoPlaceSig = null; if ($d.dialog('instance') && $d.dialog('isOpen')) $d.dialog('close'); return; }
    if (p.ownerId !== Player.id) {
        // Someone else is placing : show a brief note, no modal.
        return;
    }

    // No meaningful choice to make (single tile, single orientation, no reroll) :
    // e.g. a locked-door corridor, whose direction is already fixed by the arrow.
    // Place it directly instead of showing a one-button modal.
    if (p.candidates.length === 1 && p.candidates[0].orientations.length === 1 && !p.canReroll) {
        const cand = p.candidates[0];
        const sig = p.dir + ':' + cand.uid; // guard against re-sending on re-renders
        if (Game._autoPlaceSig !== sig) {
            Game._autoPlaceSig = sig;
            if ($d.dialog('instance') && $d.dialog('isOpen')) $d.dialog('close');
            sendAction('confirm-placement', { source: cand.source, rotation: cand.orientations[0].rotation });
        }
        return;
    }
    const $c = $d.find('.placement-content').empty();
    const modeLabel = p.mode === 'explore' ? 'Explorer' : 'Découvrir';
    $c.append('<p class="hint">' + modeLabel + ' : choisissez la tuile et son orientation.</p>');

    p.candidates.forEach(cand => {
        const info = TILE_INFO[cand.kind] || { label: cand.kind, icon: '' };
        const $block = $('<div class="placement-candidate"></div>');
        $block.append('<div class="cand-title">' + (cand.source === 'reserve' ? '🪨 Réserve : ' : 'Pioche : ') + info.icon + ' ' + info.label +
            (cand.fireValues ? ' (dés ' + cand.fireValues.join('·') + ')' : '') + '</div>');
        const $opts = $('<div class="orient-options"></div>');
        cand.orientations.forEach((o, i) => {
            const $opt = $('<button class="orient-btn"></button>');
            $opt.html(miniTilePreview(cand, o.exits) + '<span class="orient-label">Orientation ' + (i + 1) + '</span>');
            $opt.click(() => { $d.dialog('close'); sendAction('confirm-placement', { source: cand.source, rotation: o.rotation }); });
            $opts.append($opt);
        });
        $block.append($opts);
        $c.append($block);
    });

    const buttons = [];
    if (p.canReroll) buttons.push({ text: '🔄 Repli stratégique (' + p.mulliganLeft + ')', click: () => sendAction('reroll-placement', {}) });
    buttons.push({ text: 'Annuler', click: () => { $d.dialog('close'); sendAction('cancel-placement', {}); } });
    $d.dialog('option', 'title', '🧭 ' + modeLabel + ' une tuile');
    $d.dialog('option', 'buttons', buttons);
    if (!$d.dialog('isOpen')) $d.dialog('open');
}

function renderActions(state) {
    const my = isMyTurn();
    const ac = activeChar();
    const ap = state.ap, freeMoves = state.freeMoves;
    const blockedByPending = !!state.pending;

    // During a Run / Animal Celerity, only movement (and cancel) is allowed.
    const running = freeMoves > 0;
    const enabledFor = (def) => {
        if (!my || !ac || !ac.conscious || blockedByPending) return false;
        if (running) return def.action === 'move';
        return ap >= def.cost;
    };
    const buildBtn = (def, isAbility) => {
        const icon = isAbility ? (ABILITY_ICON[def.abilityId] || '✨') : (ACTION_ICON[def.action] || '');
        const $b = $('<button class="action-btn"><span class="act-ico">' + icon + '</span><span class="act-lbl">' + def.label +
            '</span><span class="ap-cost">' + (def.cost ? def.cost + ' PA' : '') + '</span></button>');
        $b.attr('title', def.tip);
        $b.prop('disabled', !enabledFor(def));
        if (enabledFor(def)) $b.click(() => runActionMode(def.mode, def, isAbility));
        return $b;
    };
    // Cancel button shown in place of the Run / Celerity button until a move starts.
    const buildCancelBtn = (label) => {
        const $b = $('<button class="action-btn cancel-run-btn"><span class="act-ico">↩️</span><span class="act-lbl">' +
            label + '</span><span class="ap-cost"></span></button>');
        const enabled = my && !blockedByPending && !!state.cancelRunKind;
        $b.prop('disabled', !enabled);
        if (enabled) $b.click(() => sendAction('cancel-run', {}));
        return $b;
    };

    const $base = $('#base-actions').empty();
    BASE_ACTIONS.forEach(def => {
        if (def.action === 'run' && state.cancelRunKind === 'run') { $base.append(buildCancelBtn('Annuler la course')); return; }
        $base.append(buildBtn(def, false));
    });
    const $dung = $('#dungeon-actions').empty();
    DUNGEON_ACTIONS.forEach(def => $dung.append(buildBtn(def, false)));

    const $abil = $('#ability-actions').empty();
    $('#active-char-name').text(ac ? '— ' + ac.name : '');
    if (ac) {
        ac.abilities.filter(a => !a.passive).forEach(a => {
            if (a.id === 'animal-celerity' && state.cancelRunKind === 'animal-celerity') { $abil.append(buildCancelBtn('Annuler la célérité')); return; }
            const def = { action: 'ability', abilityId: a.id, label: a.name, cost: a.cost, mode: ABILITY_MODE[a.id] || 'none', tip: a.description };
            const $b = buildBtn(def, true);
            if (a.id === 'fireball' && ac.uses && ac.uses.fireball >= 3) $b.prop('disabled', true);
            $abil.append($b);
        });
        ac.abilities.filter(a => a.passive).forEach(a => {
            $abil.append('<div class="passive-chip" title="' + a.description.replace(/"/g, '&quot;') + '">' + (ABILITY_ICON[a.id] || '✨') + ' ' + a.name + '</div>');
        });
    }

    $('#effort-btn').prop('disabled', !my || !ac || !ac.conscious || state.effortUsed || blockedByPending);
    $('#endturn-btn').prop('disabled', !my || blockedByPending);

    if (state.status !== 'PLAYING') {
        $('#active-banner').text('Partie terminée').removeClass('your-turn');
    } else if (my) {
        const koNote = ac && !ac.conscious ? ' (inconscient — passez votre tour)' : '';
        const inter = state.interrupt ? ' ⚡' : '';
        $('#active-banner').text('À vous : ' + (ac ? ac.name : '') + inter + koNote).addClass('your-turn');
        $('#endturn-btn').html('<span class="act-ico">⏭️</span> ' + (ac && !ac.conscious ? 'Passer le tour' : (state.interrupt ? 'Finir l\'action' : 'Finir le tour')));
    } else {
        $('#active-banner').text('Tour de ' + (state.activeOwnerId || '…') + (state.interrupt ? ' (action immédiate)' : '')).removeClass('your-turn');
    }

    // Board hint
    if (blockedByPending && state.pending.ownerId !== Player.id) $('#board-hint').text('Un joueur place une tuile…');
    else if (blockedByPending) $('#board-hint').text('Choisissez l\'orientation de la tuile dans la fenêtre.');
    else if (my && ac && ac.conscious && running) $('#board-hint').text('Déplacement en cours (' + freeMoves + ' restant' + (freeMoves > 1 ? 's' : '') + ') : cliquez une tuile adjacente. Seul le déplacement est possible.');
    else if (my && ac && ac.conscious) $('#board-hint').text('Cliquez une tuile adjacente pour agir, ou un emplacement « + » pour explorer/découvrir.');
    else $('#board-hint').text('En attente du tour des autres joueurs…');
}

function renderEnd(state) {
    const $ov = $('#end-overlay');
    if ($ov.is(':visible')) return;
    const won = state.status === 'WON';
    $('#end-title').html(won ? '🏆 Victoire !' : '☠️ Défaite');
    const medals = { gold: '🥇 Rang Or', silver: '🥈 Rang Argent', bronze: '🥉 Rang Bronze' };
    $('#end-rank').text(won && state.rank ? medals[state.rank] : '');
    const s = state.endStats || {};
    let summary = '';
    if (s.total !== undefined) {
        summary = 'Survivants échappés : ' + s.escaped + ' / ' + s.total + ' · Abandonnés : ' + s.abandoned + ' (dont morts : ' + s.dead + ')';
        if (won) summary += ' · Partie terminée en ' + s.turns + ' tours.';
    }
    $('#end-summary').text(summary);
    $ov.fadeIn(300);
}
