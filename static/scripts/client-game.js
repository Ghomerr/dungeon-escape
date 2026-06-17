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

// --- Reference data --------------------------------------------------------

const TILE_INFO = {
    start: { icon: '🟢', label: 'Départ', desc: 'Tuile de départ des aventuriers, au centre du donjon.' },
    exit: { icon: '🚪', label: 'Sortie', desc: 'La sortie ! Les aventuriers ici sont immunisés et gagnent la partie.' },
    simple: { icon: '🔹', label: 'Couloir', desc: 'Tuile sans danger (couloir, coude, T ou carrefour).' },
    bridge: { icon: '🌉', label: 'Pont suspendu', desc: 'Entrée uniquement via « Marcher en équilibre » (2 PA). Gratuit via Explorer.' },
    'door-front': { icon: '🚪', label: 'Porte verrouillée (avant)', desc: 'Porte verrouillée vers l\'avant : impossible de découvrir / avancer au-delà tant qu\'elle est fermée.' },
    'door-back': { icon: '🚪', label: 'Porte verrouillée (arrière)', desc: 'Porte verrouillée vers l\'arrière : impossible de revenir en arrière tant qu\'elle est fermée.' },
    trap: { icon: '⚙️', label: 'Plaque piégée', desc: 'En y entrant : jet de talent, ou -1 PV en cas d\'échec.' },
    flammable: { icon: '🪵', label: 'Inflammable', desc: 'Prend feu lors de l\'événement Incendie selon le jet de dé (valeurs affichées).' },
    poisonable: { icon: '🤢', label: 'Nauséabonde', desc: 'Devient empoisonnée lors de l\'événement Poison (-2 PV), jusqu\'au prochain événement.' },
    gloom: { icon: '🌫️', label: 'Pénombre', desc: 'Devient Obscurité totale lors de l\'événement Obscurité.' },
    'dragon-lair': { icon: '🐲', label: 'Antre de dragon', desc: 'Un dragon peut surgir ici lors de l\'événement Dragon.' }
};
const STATE_INFO = {
    fire: { icon: '🔥', label: 'En feu', desc: 'Infranchissable. -3 PV (Pyromancien -1). À éteindre.' },
    poisoned: { icon: '☠️', label: 'Empoisonnée', desc: '-2 PV en entrant, jusqu\'au prochain événement.' },
    dark: { icon: '🌑', label: 'Obscurité totale', desc: 'Entrée uniquement via « Marcher dans l\'Obscurité » (2 PA).' }
};

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
    'walk-dark': '🌑', 'walk-bridge': '🌉', extinguish: '🧯', 'pick-lock': '🗝️', hide: '🫥'
};
const ABILITY_ICON = {
    'flame-mastery': '🧯', 'apply-balm': '🌿', 'animal-celerity': '🐾', 'lockpicking': '🗝️',
    'slay-dragon': '⚔️', 'inspiration': '🎵', 'fireball': '💥', 'shadow-walk': '🌑',
    'night-vision': '👁️', 'strategic-retreat': '🔄', 'stealth': '🫥', 'rock-memory': '🪨',
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
    { action: 'pick-lock', label: 'Crocheter une porte', cost: 2, mode: 'dirHere', tip: 'Ouvre une porte verrouillée (jet de talent ; le kit n\'est consommé qu\'en cas de réussite).' },
    { action: 'hide', label: 'Se cacher', cost: 2, mode: 'none', tip: 'Ne plus être ciblé par les dragons ce tour (jet de talent ; auto au 3e essai d\'affilée).' }
];
const ABILITY_MODE = {
    'flame-mastery': 'dirHere', 'apply-balm': 'otherSameTile', 'animal-celerity': 'none',
    'lockpicking': 'dirHere', 'slay-dragon': 'none', 'inspiration': 'otherAny',
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

    $('#endturn-btn').click(() => sendAction('end-turn', {}));
    $('#effort-btn').click(() => sendAction('effort', {}));

    $('#game-emoji-bar').on('click', '.emoji-send', function () {
        Socket.emit('send-emoji', { roomId: Player.roomId, userId: Player.id, emoji: $(this).data('emoji') });
    });

    $('#end-leave').click(() => {
        Socket.emit('player-disconnect', { userId: Player.id, roomId: Player.roomId, token: Player.token });
        window.location.href = '/';
    });
});

window.addEventListener('beforeunload', () => {
    Socket.emit('player-disconnect', { userId: Player.id, roomId: Player.roomId, token: Player.token });
});

// --- Socket events ---------------------------------------------------------

Socket.on('ready-players-amount', (d) => $('#waiting-text').text(d.readyPlayersAmout + ' / ' + d.totalPlayers + ' joueurs prêts…'));
Socket.on('all-players-ready-to-play', () => $('#waiting-overlay').fadeOut(300));
Socket.on('player-left-the-room', (d) => { $('#waiting-overlay').fadeIn(150); $('#waiting-text').text('Un joueur s\'est déconnecté (' + d.missingPlayers + ' manquant(s))… Partie en pause.'); });
Socket.on('in-game-player-connected', (d) => { if (d.missingPlayers === 0) $('#waiting-overlay').fadeOut(200); });
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
        'no-door': 'Aucune porte verrouillée ici.', 'no-kits': 'Plus de kits de crochetage.',
        'no-adjacent-dragon': 'Aucun dragon adjacent.', 'no-fireball-left': 'Plus de boule de feu disponible.',
        'not-on-shadow': 'Vous devez être sur une tuile Pénombre / Obscurité.', 'bad-destination': 'Destination invalide.',
        'unconscious': 'Cet aventurier est inconscient.', 'finish-placement': 'Terminez d\'abord le placement de la tuile.',
        'no-mulligan-left': 'Plus de Repli stratégique disponible.'
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
    if (!fromTile.exits.includes(dir) || !toTile.exits.includes(OPP(dir))) return false;
    if (fromTile.doorLocked && fromTile.doorDir === dir) return false;
    if (toTile.doorLocked && toTile.doorDir === OPP(dir)) return false;
    return true;
}

function tileFullLabel(tile) {
    const base = TILE_INFO[tile.kind] || { icon: '', label: tile.kind, desc: '' };
    let txt = base.icon + ' ' + base.label;
    if (tile.state && STATE_INFO[tile.state]) txt += ' — ' + STATE_INFO[tile.state].icon + ' ' + STATE_INFO[tile.state].label;
    if (tile.doorLocked) txt += ' 🔒 (verrouillée)';
    let desc = base.desc;
    if (tile.state && STATE_INFO[tile.state]) desc = STATE_INFO[tile.state].desc;
    return txt + '\n' + desc;
}

function onTileClick(tile) {
    if (!isMyTurn()) { Dialog.openSimpleDialog($('#simple-dialog'), tileFullLabel(tile).split('\n')[0], tileFullLabel(tile).split('\n')[1]); return; }
    const ac = activeChar();
    if (!ac || !ac.conscious) return;
    const dir = dirBetween(ac.row, ac.col, tile.row, tile.col);
    const here = tileAt(ac.row, ac.col);
    const items = [];

    if (dir === 'here') {
        if (tile.state === 'fire') items.push({ label: '🧯 Éteindre l\'incendie (2 PA)', fn: () => sendAction('extinguish', {}) });
        // info as fallback
    } else if (dir !== null) {
        const connected = edgeConnected(here, dir, tile);
        const door = (here.doorLocked && here.doorDir === dir) || (tile.doorLocked && tile.doorDir === OPP(dir));
        const sameAxisExit = here.exits.includes(dir) && tile.exits.includes(OPP(dir));

        if (tile.state === 'fire') {
            items.push({ label: '🧯 Éteindre l\'incendie (2 PA)', fn: () => sendAction('extinguish', { dir }) });
            if (ac.abilities.some(a => a.id === 'elven-agility')) items.push({ label: '🤸 Entrer (Agilité elfique, 1 PA)', fn: () => sendAction('move', { dir }) });
        } else if (tile.kind === 'bridge' && connected) {
            items.push({ label: '🌉 Marcher en équilibre (2 PA)', fn: () => sendAction('walk-bridge', { dir }) });
        } else if (tile.state === 'dark' && sameAxisExit) {
            if (ac.abilities.some(a => a.id === 'night-vision')) items.push({ label: '👣 Se déplacer (Vision nocturne)', fn: () => sendAction('move', { dir }) });
            else items.push({ label: '🌑 Marcher dans l\'Obscurité (2 PA)', fn: () => sendAction('walk-dark', { dir }) });
        } else if (connected) {
            items.push({ label: '👣 Se déplacer ici (1 PA)', fn: () => sendAction('move', { dir }) });
        }
        if (door) items.push({ label: '🗝️ Crocheter la porte (2 PA)', fn: () => sendAction('pick-lock', { dir }) });
    }

    const parts = tileFullLabel(tile).split('\n');
    items.push({ label: 'ℹ️ ' + parts[0], fn: () => Dialog.openSimpleDialog($('#simple-dialog'), parts[0], parts[1]) });

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

function render(state) {
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
        info += ' · À ' + (ac.ownerId === Player.id ? 'VOUS' : ac.ownerId) + ' : ' + ac.emoji + ' ' + ac.name +
            ' — ' + state.ap + ' PA' + (state.freeMoves ? ' (+' + state.freeMoves + ' dépl.)' : '');
        if (state.interrupt) info += ' ⚡ action immédiate';
    }
    $('#turn-info').text(info);
    if (state.suddenDeath) $('#turns-left').html('<span class="sudden">💀 MORT SUBITE</span>');
    else $('#turns-left').text('Tours restants : ' + state.turnsLeft);
    if (state.dragons.length) $('#dragon-marker').show().text('🐉 ×' + state.dragons.length + ' dans le donjon');
    else $('#dragon-marker').hide();
}

function renderParty(state) {
    const $list = $('#party-list').empty();
    state.characters.forEach(c => {
        let status = '';
        if (c.escaped) status = '<span class="tag escaped">échappé</span>';
        else if (c.dead) status = '<span class="tag dead">mort</span>';
        else if (!c.conscious) status = '<span class="tag ko">inconscient</span>';
        else if (c.hidden) status = '<span class="tag hidden">caché</span>';
        const hpBar = '<div class="hp-bar"><div class="hp-fill" style="width:' + (c.maxHp ? (100 * c.hp / c.maxHp) : 0) + '%"></div></div>';
        const active = c.id === state.activeId ? ' active' : '';
        const arrow = c.id === state.activeId ? '<span class="active-arrow"></span>' : '';
        $list.append('<div class="party-card' + active + '" style="border-color:' + c.color + '">' + arrow +
            '<div class="pc-top"><span class="pc-emoji">' + c.emoji + '</span>' +
            '<span class="pc-name">' + c.name + '</span>' + status + '</div>' +
            '<div class="pc-hp">' + c.hp + '/' + c.maxHp + ' PV ' + hpBar + '</div>' +
            '<div class="pc-owner">👤 ' + c.ownerId + '</div></div>');
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

function renderBoard(state) {
    const board = state.board;
    const keys = Object.keys(board);
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    keys.forEach(k => { const t = board[k]; minR = Math.min(minR, t.row); maxR = Math.max(maxR, t.row); minC = Math.min(minC, t.col); maxC = Math.max(maxC, t.col); });

    // Ghost (discoverable) cells around the active character's tile.
    const ghosts = [];
    const ac = activeChar();
    if (ac && isMyTurn() && ac.conscious && !state.pending) {
        const here = board[cellKey(ac.row, ac.col)];
        if (here) {
            for (let dir = 0; dir < 4; dir++) {
                if (!here.exits.includes(dir)) continue;
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

        [0, 1, 2, 3].forEach(dir => { if (t.exits.includes(dir)) $tile.append('<div class="conn conn-' + dir + '"></div>'); });

        let glyph = (TILE_INFO[t.kind] || {}).icon || '';
        if (t.state === 'fire') glyph = '🔥'; else if (t.state === 'poisoned') glyph = '☠️'; else if (t.state === 'dark') glyph = '🌑';
        $tile.append('<div class="tile-glyph">' + glyph + '</div>');
        if (t.kind === 'flammable' && t.fireValues) $tile.append('<div class="fire-values">' + t.fireValues.join('·') + '</div>');
        if (t.doorLocked) {
            const arrows = { 0: '⬆️', 1: '➡️', 2: '⬇️', 3: '⬅️' };
            $tile.append('<div class="door-mark door-edge-' + t.doorDir + '">🔒' + (arrows[t.doorDir] || '') + '</div>');
        }

        state.dragons.filter(d => d.row === t.row && d.col === t.col).forEach(() => $tile.append('<span class="token dragon-token">🐉</span>'));
        state.characters.filter(c => !c.escaped && !c.dead && c.row === t.row && c.col === t.col).forEach(c => {
            const koCls = c.conscious ? '' : ' ko';
            const activeCls = c.id === state.activeId ? ' tok-active' : '';
            $tile.append('<span class="token char-token' + koCls + activeCls + '" style="background:' + c.color + '" title="' + c.name + ' (' + c.hp + '/' + c.maxHp + ')">' + c.emoji + '</span>');
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
}

function miniTilePreview(shape, exits, kind) {
    let html = '<div class="mini-tile kind-' + (kind || 'simple') + '">';
    [0, 1, 2, 3].forEach(d => { if (exits.includes(d)) html += '<div class="mini-conn mini-conn-' + d + '"></div>'; });
    html += '<div class="mini-glyph">' + ((TILE_INFO[kind] || {}).icon || '') + '</div></div>';
    return html;
}

function renderPlacement(state) {
    const $d = $('#placement-dialog');
    const p = state.pending;
    if (!p) { if ($d.dialog('instance') && $d.dialog('isOpen')) $d.dialog('close'); return; }
    if (p.ownerId !== Player.id) {
        // Someone else is placing : show a brief note, no modal.
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
            $opt.html(miniTilePreview(cand.shape, o.exits, cand.kind) + '<span class="orient-label">Orientation ' + (i + 1) + '</span>');
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

    const enabledFor = (def) => {
        if (!my || !ac || !ac.conscious || blockedByPending) return false;
        if (def.action === 'move' && freeMoves > 0) return true;
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

    const $base = $('#base-actions').empty();
    BASE_ACTIONS.forEach(def => $base.append(buildBtn(def, false)));
    const $dung = $('#dungeon-actions').empty();
    DUNGEON_ACTIONS.forEach(def => $dung.append(buildBtn(def, false)));

    const $abil = $('#ability-actions').empty();
    $('#active-char-name').text(ac ? '— ' + ac.name : '');
    if (ac) {
        ac.abilities.filter(a => !a.passive).forEach(a => {
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
