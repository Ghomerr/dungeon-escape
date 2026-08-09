const Socket = io();
const Player = {};
const Game = { state: null };

let CELL = 84; // px per board cell (kept constant so tokens/animations stay aligned)

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
// Dragon-lair decor combos, picked deterministically per tile (uid). Rendered
// upright over the chamber from standalone assets (decor-<name>.png).
const DRAGON_DECOR = [
    ['gold', 'chest'], ['bones', 'skull'], ['chest', 'gold'],
    ['skull', 'bones'], ['gold', 'skull'], ['chest', 'bones']
];

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
// Board pawns use <id>.png; character cards / target menus use the framed
// <id>_portrait.png variant.
function portraitUrl(id) { return 'static/assets/adventurers/' + id + '.png'; }
function portraitCardUrl(id) { return 'static/assets/adventurers/' + id + '_portrait.png'; }

const EVENT_INFO = {
    fire: { icon: '🔥', desc: 'Un jet de dé désigne les tuiles inflammables qui prennent feu (-3 PV ; Pyromancien -1).' },
    curse: { icon: '🌀', desc: 'Chaque aventurier conscient fait un jet de talent ; en cas d\'échec : -1 PV.' },
    poison: { icon: '☠️', desc: 'Les tuiles nauséabondes deviennent empoisonnées (-2 PV), jusqu\'au prochain événement.' },
    dragon: { icon: '🐉', desc: 'Les dragons présents se déplacent vers l\'aventurier le plus proche, puis un nouveau dragon apparaît (max 3).' },
    gloom: { icon: '🌑', desc: 'Les tuiles pénombre deviennent Obscurité totale (-1 PV à ceux qui s\'y trouvent).' },
    'sudden-death': { icon: '💀', desc: 'Le temps est écoulé : chaque aventurier encore dans le donjon fait un jet de talent ; échec = éliminé.' }
};

// FontAwesome (free, solid) equivalents for the action / ability buttons.
const faIco = (name) => '<i class="fas fa-' + name + '"></i>';
const ACTION_ICON = {
    discover: faIco('magnifying-glass'), explore: faIco('compass'), move: faIco('shoe-prints'),
    run: faIco('person-running'), heal: faIco('heart-circle-plus'),
    'walk-dark': faIco('moon'), 'walk-bridge': faIco('bridge'), extinguish: faIco('fire-extinguisher'),
    'pick-lock': faIco('key'), hide: faIco('mask')
};
const ABILITY_ICON = {
    'flame-mastery': faIco('fire-extinguisher'), 'apply-balm': faIco('leaf'), 'animal-celerity': faIco('paw'),
    'lockpicking': faIco('key'), 'slay-dragon': faIco('hand-fist'), 'inspiration': faIco('music'),
    'fireball': faIco('burst'), 'shadow-walk': faIco('moon'), 'night-vision': faIco('eye'),
    'strategic-retreat': faIco('arrows-rotate'), 'stealth': faIco('user-ninja'), 'rock-memory': faIco('mountain'),
    'fire-resist': faIco('fire'), 'elven-agility': faIco('feather'), 'luck': faIco('clover'), 'sacrifice': faIco('shield-halved')
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
    'fireball': 'fireballDir', 'shadow-walk': 'shadowDest'
};

// --- Bootstrap -------------------------------------------------------------

$(document).ready(() => {
    if (!Player.roomId || !Player.id || !Player.token) { window.location.href = '/'; return; }

    $('#simple-dialog').dialog({ modal: true, autoOpen: false });
    $('#dir-dialog').dialog({ modal: true, autoOpen: false, width: 260 });
    $('#choice-dialog').dialog({ modal: true, autoOpen: false, width: 300 });
    $('#placement-dialog').dialog({ modal: true, autoOpen: false, width: 430 });
    $('#log-dialog').dialog({ modal: true, autoOpen: false, width: Math.min(560, $(window).width() - 30), height: Math.min(560, $(window).height() - 60), buttons: [{ text: 'Fermer', click: () => $('#log-dialog').dialog('close') }] });
    $('#event-dialog').dialog({ modal: true, autoOpen: false, width: Math.min(420, $(window).width() - 30), buttons: [{ text: 'Fermer', click: () => $('#event-dialog').dialog('close') }] });
    $('#char-dialog').dialog({ modal: true, autoOpen: false, width: Math.min(440, $(window).width() - 30), buttons: [{ text: 'Fermer', click: () => $('#char-dialog').dialog('close') }] });

    // Tapping a party card opens the adventurer's details + abilities (the hover
    // tooltip is unreachable on touch devices).
    $('#party-list').on('click', '.party-card', function () {
        const cid = $(this).data('cid');
        const c = Game.state && Game.state.characters.find(x => x.id === cid);
        if (c) openCharDialog(c);
    });

    // Journal opens in a modal; opening it clears the "unread" badge.
    $('#journal-btn').click(() => {
        Game._logUnread = 0;
        $('#journal-badge').hide().text('');
        $('#log-dialog').dialog('open');
    });
    // Emoji bar toggle: a small floating popover near the bottom (reliably
    // visible on both mobile and PC).
    $('#emoji-toggle-btn').click(() => $('#game-emoji-bar').toggleClass('open'));
    $('#game-emoji-bar').on('click', '.emoji-send', () => $('#game-emoji-bar').removeClass('open'));

    // Manual compact/detailed toggles for the two side rails (double-arrow
    // buttons). Defaults to detailed on wide screens, compact on phones.
    initUiModes();
    watchUiBreakpoint();
    $('#party-toggle').click(() => toggleUiMode('party'));
    $('#actions-toggle').click(() => toggleUiMode('actions'));

    // Escape leaves the board targeting mode (fireball, shadow walk, heal…).
    $(document).on('keydown', (e) => { if (e.key === 'Escape') cancelTargeting(); });

    Socket.emit('join-game', { roomId: Player.roomId, userId: Player.id, token: Player.token });

    $('#endturn-btn').click(() => {
        // Warn before ending the turn while action points are still available.
        const state = Game.state;
        if (isMyTurn() && state && state.ap > 0) {
            const ac = activeChar();
            Dialog.openTwoChoicesDialog($('#simple-dialog'), 'Terminer le tour',
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

    // Live markdown viewers (rules + changelog), available during the game.
    $('#rules-link').on('click', () => Dialog.openMarkdown('rules.md', '📖 Règles du jeu'));
    $('#changelog-link').on('click', () => Dialog.openMarkdown('changelog.md', '📜 Changelog'));

    // --- Background music ---------------------------------------------------
    const $audioControl = $('#audio-control');
    const audio = $('#bg-music')[0];
    // Music preference is shared with the lobby page; default ON unless the
    // player explicitly muted it earlier.
    let musicEnabled = localStorage.getItem('de-music') !== 'off';

    const setMusicIcon = (playing) => {
        $audioControl.find('i')
            .toggleClass('fa-volume-high', playing)
            .toggleClass('fa-volume-xmark', !playing);
    };

    // Autoplay is blocked when no user gesture carried across the navigation
    // (always the case for non-host players pushed here by `game-started`).
    // Try now; if the browser refuses, start on the first interaction in-game.
    const armGestureFallback = () => {
        const resume = () => {
            document.removeEventListener('pointerdown', resume);
            document.removeEventListener('keydown', resume);
            if (musicEnabled) audio.play().then(() => setMusicIcon(true)).catch(() => {});
        };
        document.addEventListener('pointerdown', resume);
        document.addEventListener('keydown', resume);
    };

    $audioControl.click(() => {
        if (audio.paused) {
            musicEnabled = true;
            localStorage.setItem('de-music', 'on');
            audio.play().then(() => setMusicIcon(true)).catch(() => {});
        } else {
            musicEnabled = false;
            localStorage.setItem('de-music', 'off');
            audio.pause();
            setMusicIcon(false);
        }
    });

    setMusicIcon(false);
    if (musicEnabled) {
        audio.play().then(() => setMusicIcon(true)).catch(() => armGestureFallback());
    }
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
    // Ran out of action points on an action triggered from the board (a move
    // by clicking an adjacent tile, etc.): offer an Effort then replay it.
    if (data.error === 'no-ap' && canEffort() && Game._lastAction && Game._lastAction.action !== 'effort') {
        const la = Game._lastAction;
        Dialog.openTwoChoicesDialog($('#simple-dialog'), 'Pas assez de PA',
            'Il ne reste que <b>' + Game.state.ap + ' PA</b>.<br>Faire un <b>Effort</b> (+1 PA, jet de talent en fin de tour) puis relancer l\'action ?',
            '<i class="fas fa-dumbbell"></i> Effort + action', () => { sendAction('effort', {}); sendAction(la.action, la.payload); },
            'Annuler', null);
        return;
    }
    if (data.error && M[data.error]) Dialog.openSimpleDialog($('#simple-dialog'), 'Action impossible', M[data.error]);
});

Socket.on('emoji', (data) => {
    const $b = $('#game-emoji-bubble');
    $b.html(Dialog.reactionHtml(data.from, data.emoji)).stop(true, true).css('opacity', 1);
    clearTimeout(Game._emojiTimer);
    Game._emojiTimer = setTimeout(() => $b.fadeTo(600, 0, () => $b.text('').css('opacity', 1)), 2500);
});

Socket.on('game-state', (state) => { Game.state = state; render(state); });

// --- Helpers ---------------------------------------------------------------

function sendAction(action, payload) {
    Game._lastAction = { action, payload: payload || {} };
    Socket.emit('game-action', { roomId: Player.roomId, userId: Player.id, token: Player.token, action, payload: payload || {} });
}

// Offer an Effort (+1 PA) then run the action, when the active adventurer is one
// point short. Emits happen in order over the socket, so the server processes
// the Effort before the action.
function canEffort() {
    const s = Game.state, ac = activeChar();
    return isMyTurn() && ac && ac.conscious && s && !s.effortUsed && !s.pending;
}
function offerEffortThen(label, cost, runFn) {
    Dialog.openTwoChoicesDialog($('#simple-dialog'), 'Pas assez de PA',
        '<b>' + escapeHtml(label) + '</b> coûte <b>' + cost + ' PA</b>, mais il ne reste que <b>' + Game.state.ap +
        ' PA</b>.<br>Faire un <b>Effort</b> (+1 PA, jet de talent en fin de tour) puis lancer l\'action ?',
        '<i class="fas fa-dumbbell"></i> Effort + action', () => { sendAction('effort', {}); runFn(); },
        'Annuler', null);
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

// --- Board targeting mode ---------------------------------------------------
// Instead of asking for coordinates / names in a modal, an action can enter a
// "targeting" mode : the eligible cells (or adventurers) are highlighted on the
// board and a single click on one of them validates the action.
//
// Game.targeting = {
//   charId, title, cls,           // highlight colour class (tgt-orange, …)
//   mark,                         // small icon drawn in the middle of a cell
//   cells: [{ row, col, onPick }] // highlighted board cells (may be empty cells)
//   chars: [{ id, onPick }]       // highlighted adventurer tokens
// }

function startTargeting(opts) {
    Game.targeting = opts;
    $('#target-bar').html('<span class="tb-txt">' + opts.title + '</span>' +
        '<button class="tb-cancel"><i class="fas fa-xmark"></i> Annuler</button>').css('display', 'flex');
    $('#target-bar .tb-cancel').off('click').on('click', cancelTargeting);
    if (Game.state) { renderBoard(Game.state); renderActions(Game.state); }
}

function cancelTargeting() {
    if (!Game.targeting) return;
    Game.targeting = null;
    $('#target-bar').hide().empty();
    if (Game.state) { renderBoard(Game.state); renderActions(Game.state); }
}

// Leave targeting mode, then run the picked action.
function resolveTarget(fn) { cancelTargeting(); fn(); }

// --- Action modes (for side buttons) ---------------------------------------

function runActionMode(mode, def, isAbility) {
    const ac = activeChar();
    const emit = (payload) => {
        if (isAbility) { payload.abilityId = def.abilityId; sendAction('ability', payload); }
        else sendAction(def.action, payload);
    };
    // Any new action cancels a targeting still in progress.
    cancelTargeting();
    // Highlight adventurers in green and validate on a click on their token.
    const targetChars = (cands, title) => startTargeting({
        charId: ac.id, title, cls: 'tgt-green',
        chars: cands.map(c => ({ id: c.id, onPick: () => emit({ targetId: c.id }) }))
    });

    switch (mode) {
        case 'none': emit({}); break;
        case 'dir': openDirPicker({ title: def.label }, (dir) => emit({ dir })); break;
        case 'dirHere': openDirPicker({ title: def.label, here: true }, (dir) => emit(dir === 'here' ? {} : { dir })); break;
        case 'sameTile': {
            const cands = Game.state.characters.filter(c => !c.escaped && !c.dead && c.row === ac.row && c.col === ac.col);
            if (!cands.length) return;
            // Alone on the tile : heal oneself immediately, no target to pick.
            if (cands.length === 1) { emit({ targetId: cands[0].id }); return; }
            targetChars(cands, '💚 ' + def.label + ' : cliquez l\'aventurier à soigner.');
            break;
        }
        case 'otherSameTile': {
            const cands = Game.state.characters.filter(c => c.id !== ac.id && !c.escaped && !c.dead && c.row === ac.row && c.col === ac.col);
            if (!cands.length) { Dialog.openSimpleDialog($('#simple-dialog'), 'Aucune cible', 'Aucun autre aventurier sur cette tuile.'); return; }
            targetChars(cands, '💚 ' + def.label + ' : cliquez l\'aventurier à cibler.');
            break;
        }
        case 'otherAny': {
            const cands = Game.state.characters.filter(c => c.id !== ac.id && !c.escaped && !c.dead && c.conscious);
            if (!cands.length) return;
            targetChars(cands, '💚 ' + def.label + ' : cliquez l\'aventurier à inspirer.');
            break;
        }
        case 'fireballDir': {
            // A fireball blasts a WALL open : only the sides with no usable
            // opening (or blocked by a locked door) are worth targeting.
            const here = tileAt(ac.row, ac.col);
            const cells = [];
            for (let dir = 0; dir < 4; dir++) {
                const blocked = !tileOpensToward(here, dir) || (here.doorLocked && here.doorDir === dir);
                if (!blocked) continue;
                cells.push({
                    row: ac.row + DELTA[dir].r, col: ac.col + DELTA[dir].c,
                    onPick: () => emit({ dir })
                });
            }
            if (!cells.length) { Dialog.openSimpleDialog($('#simple-dialog'), 'Aucune paroi', 'Toutes les issues de cette tuile sont déjà ouvertes.'); return; }
            startTargeting({
                charId: ac.id, cls: 'tgt-orange', mark: '<i class="fas fa-burst"></i>',
                title: '💥 Boule de feu : cliquez la paroi à faire exploser.', cells
            });
            break;
        }
        case 'shadowDest': {
            const cells = Object.keys(Game.state.board)
                .map(k => Game.state.board[k])
                .filter(t => (t.kind === 'gloom' || t.state === 'dark') && !(t.row === ac.row && t.col === ac.col))
                .map(t => ({ row: t.row, col: t.col, onPick: () => emit({ destCell: cellKey(t.row, t.col) }) }));
            if (!cells.length) { Dialog.openSimpleDialog($('#simple-dialog'), 'Aucune destination', 'Aucune autre tuile Pénombre / Obscurité.'); return; }
            startTargeting({
                charId: ac.id, cls: 'tgt-purple', mark: '<i class="fas fa-moon"></i>',
                title: '🌑 Marche de l\'Ombre : cliquez la tuile de réapparition.', cells
            });
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

// Show the clicked tile's description as a floating panel over the board that
// fades out on its own (the side rails no longer host it).
function showTileDesc(tile) {
    const parts = tileFullLabel(tile).split('\n');
    const $d = $('#tile-desc').removeClass('tile-desc-empty').html(
        '<div class="td-title">' + escapeHtml(parts[0]) + '</div>' +
        '<div class="td-body">' + escapeHtml(parts[1] || '') + '</div>');
    $d.stop(true, true).css('display', 'block').css('opacity', 1);
    clearTimeout(Game._tileDescTimer);
    Game._tileDescTimer = setTimeout(() => $d.fadeOut(400), 5000);
}

// Dangers that make the active character lose HP just by entering `tile`
// (see server enterTile). Returns a list of HTML warning lines.
function moveDangerWarnings(tile, ac) {
    const warns = [];
    const immune = ac.abilities && ac.abilities.some(a => a.id === 'stealth');
    const state = Game.state;
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

const hasAbility = (c, id) => !!(c && c.abilities && c.abilities.some(a => a.id === id));

/**
 * How the active adventurer may step onto `tile` right now, for the board
 * highlight :
 *   'mv-ok'     (white)  — a plain 1 AP move ;
 *   'mv-hard'   (orange) — costs 2 AP (suspended bridge, total darkness) ;
 *   'mv-danger' (red)    — entering it may cost hit points (poison, trap,
 *                          dragon, flames).
 * Returns null when the tile is not a legal destination.
 */
function moveHighlightClass(tile, ac, here) {
    const dir = dirBetween(ac.row, ac.col, tile.row, tile.col);
    if (dir === null || dir === 'here') return null;
    const connected = edgeConnected(here, dir, tile);
    const sameAxisExit = tileOpensToward(here, dir) && tileOpensToward(tile, OPP(dir));
    const elf = hasAbility(ac, 'elven-agility');

    let cost;
    if (tile.state === 'fire') {
        // Only the Elf may walk into flames (and she takes no damage doing so).
        if (!elf || !connected) return null;
        cost = 1;
    } else if (tile.kind === 'bridge') {
        if (!connected) return null;
        cost = elf ? 1 : 2;
    } else if (tile.state === 'dark') {
        if (!sameAxisExit) return null;
        cost = hasAbility(ac, 'night-vision') ? 1 : 2;
    } else if (connected) {
        cost = 1;
    } else {
        return null;
    }
    if (moveDangerWarnings(tile, ac).length) return 'mv-danger';
    return cost >= 2 ? 'mv-hard' : 'mv-ok';
}

// Run `doIt` (the actual move), but if the destination is dangerous, ask the
// player to confirm first, recalling the hazard(s) awaiting the adventurer.
function moveWithConfirm(tile, ac, doIt) {
    const warns = moveDangerWarnings(tile, ac);
    if (!warns.length) { doIt(); return; }
    const body = escapeHtml(ac.name) + ' va entrer sur cette tuile :' +
        '<ul><li>' + warns.join('</li><li>') + '</li></ul>Confirmer le déplacement ?';
    Dialog.openTwoChoicesDialog($('#simple-dialog'), 'Déplacement dangereux', body,
        'Se déplacer quand même', doIt, 'Annuler', null);
}

function onTileClick(tile) {
    showTileDesc(tile);
    // While aiming an action, only the highlighted cells / tokens are actionable.
    if (Game.targeting) return;
    if (!isMyTurn()) return;
    const ac = activeChar();
    if (!ac || !ac.conscious) return;
    const dir = dirBetween(ac.row, ac.col, tile.row, tile.col);
    const here = tileAt(ac.row, ac.col);
    const items = [];

    // A locked door is always picked from the tile you stand on (any direction).
    const canPickHere = here.doorLocked;

    if (dir === 'here') {
        if (tile.state === 'fire') items.push({ label: ACTION_ICON['extinguish'] + ' Éteindre l\'incendie (2 PA)', fn: () => sendAction('extinguish', {}) });
        if (canPickHere) items.push({ label: ACTION_ICON['pick-lock'] + ' Crocheter la porte (2 PA)', fn: () => sendAction('pick-lock', {}) });
    } else if (dir !== null) {
        const connected = edgeConnected(here, dir, tile);
        // Our own door blocks leaving this way : offer to pick it (from here).
        const blockedByOwnDoor = here.doorLocked && here.doorDir === dir;
        const sameAxisExit = tileOpensToward(here, dir) && tileOpensToward(tile, OPP(dir));

        if (tile.state === 'fire') {
            items.push({ label: ACTION_ICON['extinguish'] + ' Éteindre l\'incendie (2 PA)', fn: () => sendAction('extinguish', { dir }) });
            if (ac.abilities.some(a => a.id === 'elven-agility')) items.push({ label: ABILITY_ICON['elven-agility'] + ' Entrer (Agilité elfique, 1 PA)', fn: () => moveWithConfirm(tile, ac, () => sendAction('move', { dir })) });
        } else if (tile.kind === 'bridge' && connected) {
            items.push({ label: ACTION_ICON['walk-bridge'] + ' Marcher en équilibre (2 PA)', fn: () => sendAction('walk-bridge', { dir }) });
        } else if (tile.state === 'dark' && sameAxisExit) {
            if (ac.abilities.some(a => a.id === 'night-vision')) items.push({ label: ACTION_ICON['move'] + ' Se déplacer (Vision nocturne)', fn: () => moveWithConfirm(tile, ac, () => sendAction('move', { dir })) });
            else items.push({ label: ACTION_ICON['walk-dark'] + ' Marcher dans l\'Obscurité (2 PA)', fn: () => sendAction('walk-dark', { dir }) });
        } else if (connected) {
            items.push({ label: ACTION_ICON['move'] + ' Se déplacer ici (1 PA)', fn: () => moveWithConfirm(tile, ac, () => sendAction('move', { dir })) });
        }
        if (blockedByOwnDoor) items.push({ label: ACTION_ICON['pick-lock'] + ' Crocheter la porte qui bloque ce passage (2 PA)', fn: () => sendAction('pick-lock', {}) });
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
        { label: ACTION_ICON['explore'] + ' Explorer (découvrir + entrer, 1 PA)', fn: () => sendAction('explore', { dir }) },
        { label: ACTION_ICON['discover'] + ' Découvrir (placer la tuile, 1 PA)', fn: () => sendAction('discover', { dir }) }
    ]);
}

// --- Rendering -------------------------------------------------------------

// Ambient colour of each event (for the central toast).
const EVENT_COLORS = {
    fire: '#b83a1c', curse: '#6c3fb5', poison: '#4c8f2a',
    dragon: '#8b1a1a', gloom: '#2a2f6b', 'sudden-death': '#1a1a1a'
};

// Every bad event has its own (landscape) illustration, shown in the central
// toast, the left rail and the details modal. The emoji from EVENT_INFO is kept
// for the compact mobile rail, where there is no room for a picture.
// NB: the Dragon *phase* and the board token keep the original artwork
// (adventurers/dragon.png and its portrait crop) — only the bad-event card uses
// the illustration below.
const BAD_EVENT_PATH = 'static/assets/bad-events/';
const EVENT_IMG = {
    fire: BAD_EVENT_PATH + 'fire.png',
    curse: BAD_EVENT_PATH + 'curse.png',
    poison: BAD_EVENT_PATH + 'poison.png',
    dragon: BAD_EVENT_PATH + 'dragon.png',
    gloom: BAD_EVENT_PATH + 'gloom.png',
    'sudden-death': BAD_EVENT_PATH + 'sudden-death.png'
};

// A doubled card ("Incendie x2") keeps the illustration of its base type: the
// doubling is marked by a ×2 seal stamped on the picture (or next to the emoji
// in the compact rail) rather than spelled out again in the name.
const x2Badge = (e) => (e && e.doubled) ? '<span class="x2-badge">×2</span>' : '';
// Server labels already end with " x2"; drop it wherever the seal is shown next
// to the name, so the information is not displayed twice.
const eventName = (e) => e.doubled ? e.label.replace(/\s*x\s*2\s*$/i, '') : e.label;

// The illustration of an event, with its ×2 seal when the card is doubled.
// `variant` picks the sizing: 'toast' (central announcement) or 'inline'
// (left rail + details modal).
function eventIllustration(e, variant) {
    const src = EVENT_IMG[e.type];
    const info = EVENT_INFO[e.type] || { icon: '🎴' };
    if (!src) return '<span class="' + (variant === 'toast' ? 'toast-icon' : 'event-icon') + '">' +
        info.icon + '</span>' + x2Badge(e);
    const wrapCls = variant === 'toast' ? 'toast-illu' : 'event-illu';
    const imgCls = variant === 'toast' ? 'toast-img' : 'event-img';
    return '<span class="' + wrapCls + '"><img class="' + imgCls + '" src="' + src + '" alt="">' + x2Badge(e) + '</span>';
}

// Large central toasts (bad events, hiding attempts, sudden death…). They are
// queued so two announcements in the same state update play one after the other
// instead of overwriting each other.
function showBigToast(t) {
    Game._toastQueue = Game._toastQueue || [];
    Game._toastQueue.push(t);
    if (!Game._toastBusy) playNextBigToast();
}

function playNextBigToast() {
    const t = (Game._toastQueue || []).shift();
    const $t = $('#event-toast');
    if (!t) { Game._toastBusy = false; $t.css('display', 'none'); return; }
    Game._toastBusy = true;
    $t[0].style.setProperty('--toast-color', t.color || '#333');
    $t.html(t.iconHtml + '<span class="toast-label">' + t.label + '</span>' +
        (t.sub ? '<span class="toast-sub">' + t.sub + '</span>' : ''));
    // Replay the pop animation on every toast (the element itself is reused).
    $t.stop(true, false).removeClass('pop').css({ display: 'flex', opacity: 0 });
    void $t[0].offsetWidth;
    $t.addClass('pop').animate({ opacity: 1 }, 200);
    clearTimeout(Game._toastTimer);
    Game._toastTimer = setTimeout(() => $t.animate({ opacity: 0 }, 400, playNextBigToast), t.ms || 3000);
}

// Large central toast shown when a bad event occurs.
function showEventToast(ev) {
    showBigToast({
        color: EVENT_COLORS[ev.type] || '#333',
        iconHtml: eventIllustration(ev, 'toast'),
        label: escapeHtml(eventName(ev) || ''),
        ms: 3200
    });
}

// --- One-shot server feedback (fx queue) ------------------------------------
// The server appends entries with an increasing `seq`; we only play what we have
// not seen yet, so a reconnecting client silently skips the backlog.
function processFx(state) {
    const list = state.fx || [];
    if (Game._fxSeq === undefined) {
        Game._fxSeq = list.length ? list[list.length - 1].seq : 0;
        return;
    }
    list.forEach(fx => {
        if (fx.seq <= Game._fxSeq) return;
        Game._fxSeq = fx.seq;
        playFx(fx);
    });
}

function playFx(fx) {
    switch (fx.kind) {
        case 'hide':
            showBigToast(fx.success ? {
                color: '#2f2f5e', iconHtml: '<span class="toast-icon">🫥</span>',
                label: escapeHtml(fx.name) + ' se cache !',
                sub: fx.auto ? 'Réussite automatique (3e essai)' : 'Jet de talent réussi (dé ' + fx.roll + ')',
                ms: 2600
            } : {
                color: '#7a3a12', iconHtml: '<span class="toast-icon">👀</span>',
                label: escapeHtml(fx.name) + ' reste visible',
                sub: 'Échec de la dissimulation (dé ' + fx.roll + ')',
                ms: 2600
            });
            break;
        case 'sudden-death': {
            const lines = [];
            if (fx.killed && fx.killed.length) lines.push('💀 Dévorés : ' + escapeHtml(fx.killed.join(', ')));
            if (fx.survived && fx.survived.length) lines.push('🕯️ Résistent : ' + escapeHtml(fx.survived.join(', ')));
            if (!lines.length) break;
            // The "Mort subite" announcement (with its illustration) has just
            // played; this second toast reports who survived the roll.
            showBigToast({
                color: '#1a1a1a', iconHtml: '<span class="toast-icon">💀</span>',
                label: 'Les ténèbres frappent', sub: lines.join('<br>'), ms: 5000
            });
            break;
        }
        case 'dragon-slain':
            spawnDragonSlainFx(fx.row, fx.col);
            break;
    }
}

// Broken-heart burst over the cell where a Dragon has just been slain (same
// visual language as the damage feedback on adventurers).
function spawnDragonSlainFx(row, col) {
    if (!Game._boardMin) return;
    const { minR, minC } = Game._boardMin;
    const $fx = $('<span class="hp-fx on-board dragon-slain"><i class="fas fa-heart-crack"></i></span>')
        .css({ left: (col - minC) * CELL + CELL / 2 + 'px', top: (row - minR) * CELL + CELL / 2 + 'px' });
    $('#board').append($fx);
    setTimeout(() => $fx.remove(), 1600);
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

// --- Rail display modes (compact icons ↔ detailed with names) --------------

const WIDE_UI = () => window.innerWidth >= 900;
// The preference is remembered per layout: collapsing a rail on a phone must not
// leave the desktop stuck in compact mode. A roomy screen therefore always opens
// with both rails fully expanded unless they were collapsed *while* roomy.
function uiKey(which) { return 'de-' + which + '-view-' + (WIDE_UI() ? 'wide' : 'narrow'); }

function initUiModes() {
    const wide = WIDE_UI();
    Game.ui = {
        party: localStorage.getItem(uiKey('party')) || (wide ? 'expanded' : 'compact'),
        actions: localStorage.getItem(uiKey('actions')) || (wide ? 'expanded' : 'compact')
    };
    applyUiModes();
}

// Crossing the wide/narrow boundary (rotation, window resize, dev tools) swaps
// to the preference stored for the new layout.
function watchUiBreakpoint() {
    let wasWide = WIDE_UI();
    $(window).on('resize', () => {
        if (WIDE_UI() === wasWide) return;
        wasWide = WIDE_UI();
        initUiModes();
        if (Game.state) render(Game.state);
    });
}
function applyUiModes() {
    const $m = $('.game-main');
    $m.toggleClass('party-expanded', Game.ui.party === 'expanded');
    $m.toggleClass('actions-expanded', Game.ui.actions === 'expanded');
    // Arrow points "outward" to collapse, "inward" to expand.
    $('#party-toggle i').attr('class', Game.ui.party === 'expanded' ? 'fas fa-angles-left' : 'fas fa-angles-right');
    $('#actions-toggle i').attr('class', Game.ui.actions === 'expanded' ? 'fas fa-angles-right' : 'fas fa-angles-left');
}
function toggleUiMode(which) {
    Game.ui[which] = Game.ui[which] === 'expanded' ? 'compact' : 'expanded';
    localStorage.setItem(uiKey(which), Game.ui[which]);
    applyUiModes();
    if (Game.state) {
        if (which === 'party') { renderParty(Game.state); renderEvent(Game.state); }
        else renderActions(Game.state);
    }
}

function render(state) {
    maybeShowEventToast(state);
    // A targeting in progress only makes sense for the adventurer that started
    // it, while it is still our turn and nothing else is pending.
    if (Game.targeting && (!isMyTurn() || state.pending || state.activeId !== Game.targeting.charId)) {
        Game.targeting = null;
        $('#target-bar').hide().empty();
    }
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
    renderFireballs(state);
    spawnHpFx(state);
    processFx(state);
}

// Fireball counter (Pyromancer only) — shown next to kits / deck so the whole
// party can see how many blasts are left.
const FIREBALL_USES = 3;
function renderFireballs(state) {
    const pyro = state.characters.find(c => c.abilities && c.abilities.some(a => a.id === 'fireball'));
    if (!pyro) { $('#fireball-res').hide(); return; }
    const left = Math.max(0, FIREBALL_USES - ((pyro.uses && pyro.uses.fireball) || 0));
    $('#fireball-count').text(left);
    $('#fireball-res').css('display', '');
}

/**
 * Centre of an adventurer's token, in #board coordinates.
 *
 * Walking the offsetParent chain (rather than getBoundingClientRect) keeps the
 * result independent of the board's scroll position AND of the slide animation's
 * transform. It also pins the feedback to the token itself, not to the middle of
 * the tile — which matters as soon as two adventurers share a tile.
 */
function tokenCenter(cid) {
    const el = document.querySelector('#board .char-token[data-cid="' + cid + '"]');
    if (!el) return null;
    let x = el.offsetLeft + el.offsetWidth / 2;
    let y = el.offsetTop + el.offsetHeight / 2;
    let p = el.offsetParent;                       // the tile, then the board
    while (p && p.id !== 'board') { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent; }
    if (!p) return null;
    return { x, y, h: el.offsetHeight };
}

// Floating heal / damage feedback: when an adventurer's HP changes between two
// states, a FontAwesome icon pops over their token ON THE BOARD (green heart
// rising for a heal, red cracked heart shaking for damage) then fades out.
function spawnHpFx(state) {
    const prev = Game._prevHp;
    const cur = {};
    state.characters.forEach(c => { cur[c.id] = c.hp; });
    if (prev) {
        state.characters.forEach(c => {
            const before = prev[c.id];
            if (before === undefined || before === c.hp) return;
            if (c.escaped || c.dead) return;   // no token on the board
            const pos = tokenCenter(c.id);
            if (!pos) return;
            const healed = c.hp > before;
            const $fx = $('<span class="hp-fx on-board ' + (healed ? 'heal' : 'damage') + '"><i class="fas fa-' +
                (healed ? 'heart-circle-plus' : 'heart-crack') + '"></i></span>')
                .css({ left: pos.x + 'px', top: pos.y + 'px' });
            $('#board').append($fx);
            setTimeout(() => $fx.remove(), 1200);
        });
    }
    Game._prevHp = cur;
}

function renderHeader(state) {
    const ac = activeChar();
    // Structured turn info: on mobile only the active adventurer's name (.ti-who)
    // is shown; the round number (.ti-round) and AP / position (.ti-extra) are
    // hidden by CSS since that detail lives elsewhere on small screens.
    let who = '';
    if (ac) {
        who = 'À ' + (ac.ownerId === Player.id ? 'VOUS' : escapeHtml(ac.ownerId)) + ' : ' + escapeHtml(ac.name) +
            (state.interrupt ? ' ⚡' : '');
    }
    let extra = '';
    if (ac) {
        extra = ' — ' + state.ap + ' PA' + (state.freeMoves ? ' (+' + state.freeMoves + ' dépl.)' : '');
        if (state.interrupt) extra += ' action immédiate';
        if (state.turnTotal) {
            const pos = state.turnTotal - state.turnRemaining + 1;
            const left = state.turnRemaining - 1; // adventurers still waiting after the active one
            extra += ' · Aventurier ' + pos + '/' + state.turnTotal +
                (left > 0 ? ' (' + left + ' après lui)' : ' (dernier du tour)');
        }
    }
    $('#turn-info').html('<span class="ti-round">Tour ' + state.round + (who ? ' · ' : '') + '</span>' +
        '<span class="ti-who">' + who + '</span>' +
        '<span class="ti-extra">' + extra + '</span>');

    if (state.suddenDeath) $('#turns-left').attr('title', 'Mort subite').html('<span class="sudden">💀<span class="tl-lbl"> MORT SUBITE</span></span>');
    else $('#turns-left').attr('title', 'Tours restants').html('<i class="fas fa-hourglass-half tl-ico"></i><span class="tl-lbl">Tours restants : </span>' + state.turnsLeft);
    if (state.dragons.length) $('#dragon-marker').show().attr('title', state.dragons.length + ' dragon(s) dans le donjon').html('🐉 ×' + state.dragons.length);
    else $('#dragon-marker').hide();
}

// Multi-line tooltip recalling an adventurer's abilities and what they do,
// shown on hover over their party card.
function attrEscape(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function abilitiesTip(c) {
    const lines = (c.abilities || []).map(a => {
        const cost = a.passive ? 'passif' : (a.cost + ' PA');
        return '• ' + a.name + ' (' + cost + ') : ' + a.description;
    });
    return attrEscape(c.name + '\n' + lines.join('\n'));
}

// Small yellow lightning pips representing a number of action points.
function apPips(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += '<i class="fas fa-bolt"></i>';
    return s;
}

function renderParty(state) {
    const $list = $('#party-list').empty();
    const expanded = Game.ui && Game.ui.party === 'expanded';

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

    ordered.forEach(c => $list.append(expanded ? detailedPartyCard(c, state) : compactPartyCard(c, state)));
}

// Compact card (mobile / collapsed rail): portrait + HP + AP pips, status badge.
function compactPartyCard(c, state) {
    let statusIco = '', statusCls = '';
    if (c.escaped) { statusIco = '<i class="fas fa-door-open"></i>'; statusCls = ' st-escaped'; }
    else if (c.dead) { statusIco = '<i class="fas fa-skull"></i>'; statusCls = ' st-dead'; }
    else if (!c.conscious) { statusIco = '<i class="fas fa-star-of-life"></i>'; statusCls = ' st-ko'; }
    else if (c.hidden) { statusIco = '<i class="fas fa-mask"></i>'; statusCls = ' st-hidden'; }
    const statusBadge = statusIco ? '<span class="pc-status' + statusCls + '">' + statusIco + '</span>' : '';

    const hpPct = c.maxHp ? (100 * c.hp / c.maxHp) : 0;
    const hpBar = '<div class="hp-bar"><div class="hp-fill" style="width:' + hpPct + '%"></div></div>';
    const isActive = c.id === state.activeId;
    const arrow = isActive ? '<span class="active-arrow"></span>' : '';
    const apRow = isActive
        ? '<div class="pc-ap" title="Points d\'action">' + apPips(state.ap) +
          (state.freeMoves ? '<span class="pc-free">+' + state.freeMoves + '</span>' : '') + '</div>'
        : '';
    const tip = attrEscape(c.name + ' — Niv. ' + c.level + ' · ' + c.hp + '/' + c.maxHp + ' PV · ' + c.ownerId) +
        '\n' + abilitiesTip(c);
    // Compact: the tight round frame reads much better with the face crop than
    // with the full illustration (kept for the detailed card).
    return '<div class="party-card compact' + (isActive ? ' active' : '') + '" data-cid="' + c.id + '" title="' + tip + '" style="border-color:' + c.color + '">' + arrow +
        '<div class="pc-portrait" style="background-image:url(' + portraitCardUrl(c.id) + ');border-color:' + c.color + '">' + statusBadge + '</div>' +
        '<div class="pc-hp"><span class="pc-hp-num">' + c.hp + '</span>' + hpBar + '</div>' +
        apRow + '</div>';
}

// Detailed card (PC / expanded rail): the original full card with name, level,
// status tag, HP text, AP and owner.
function detailedPartyCard(c, state) {
    let status = '';
    if (c.escaped) status = '<span class="tag escaped">échappé</span>';
    else if (c.dead) status = '<span class="tag dead">mort</span>';
    else if (!c.conscious) status = '<span class="tag ko">inconscient</span>';
    else if (c.hidden) status = '<span class="tag hidden">caché</span>';
    const hpBar = '<div class="hp-bar"><div class="hp-fill" style="width:' + (c.maxHp ? (100 * c.hp / c.maxHp) : 0) + '%"></div></div>';
    const isActive = c.id === state.activeId;
    const arrow = isActive ? '<span class="active-arrow"></span>' : '';
    const apRow = isActive
        ? '<div class="pc-ap" title="Points d\'action">' + apPips(state.ap) + ' ' + state.ap + ' PA' +
          (state.freeMoves ? ' <span class="pc-free">(+' + state.freeMoves + ' dépl.)</span>' : '') + '</div>'
        : '';
    return '<div class="party-card detailed' + (isActive ? ' active' : '') + '" data-cid="' + c.id + '" title="' + abilitiesTip(c) + '" style="border-color:' + c.color + '">' + arrow +
        '<div class="pc-portrait" style="background-image:url(' + portraitUrl(c.id) + ');border-color:' + c.color + '"></div>' +
        '<div class="pc-info">' +
        '<div class="pc-name-row"><span class="pc-name">' + escapeHtml(c.name) + '</span>' +
        '<span class="pc-level" title="Niveau — les dragons ciblent en priorité le niveau le plus bas">Niv. ' + c.level + '</span>' +
        status + '</div>' +
        '<div class="pc-hp-detailed">' + c.hp + '/' + c.maxHp + ' PV ' + hpBar + '</div>' +
        apRow +
        '<div class="pc-owner"><i class="fas fa-user"></i> ' + escapeHtml(c.ownerId) + '</div></div></div>';
}

// Character details + abilities, shown in a modal when a party card is tapped.
// The modal is the place with room for the full illustration and a proper
// health bar (the rails only have space for a crop and a number).
function openCharDialog(c) {
    let statusTxt = '';
    if (c.escaped) statusTxt = '<span class="cd-status st-escaped">Échappé</span>';
    else if (c.dead) statusTxt = '<span class="cd-status st-dead">Mort</span>';
    else if (!c.conscious) statusTxt = '<span class="cd-status st-ko">Inconscient</span>';
    else if (c.hidden) statusTxt = '<span class="cd-status st-hidden">Caché</span>';

    const abilities = (c.abilities || []).map(a =>
        '<li><b>' + escapeHtml(a.name) + '</b> ' + (a.passive ? '(Passif)' : '(' + a.cost + ' PA)') +
        ' — ' + escapeHtml(a.description) + '</li>').join('');

    const hpPct = c.maxHp ? (100 * c.hp / c.maxHp) : 0;
    $('#char-detail').html(
        '<div class="cd-head">' +
        '<div class="cd-portrait" style="background-image:url(' + portraitUrl(c.id) + ');border-color:' + c.color + '"></div>' +
        '<div class="cd-id"><div class="cd-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="cd-meta">Niv. ' + c.level + ' · <i class="fas fa-user"></i> ' + escapeHtml(c.ownerId) + '</div>' +
        '<div class="cd-hp"><div class="hp-bar"><div class="hp-fill" style="width:' + hpPct + '%"></div></div>' +
        '<div class="cd-hp-num">' + c.hp + ' / ' + c.maxHp + ' PV</div></div>' +
        statusTxt + '</div></div>' +
        '<ul class="cd-abilities">' + abilities + '</ul>');
    $('#char-dialog').dialog('option', 'title', c.name);
    $('#char-dialog').dialog('open');
}

function renderEvent(state) {
    const e = state.currentEvent;
    const expanded = Game.ui && Game.ui.party === 'expanded';
    const $inline = $('#event-inline').off('click').removeClass('clickable has-event');

    if (!e) {
        // Always show the zone, even when nothing is happening (both modes).
        $inline.html('<span class="muted">Aucun événement</span>');
        $('#event-content').html('<span class="muted">Aucun événement pour l\'instant.</span>');
        return;
    }

    const info = EVENT_INFO[e.type] || { icon: '🎴', desc: '' };
    const illu = eventIllustration(e, 'inline');
    const body = '<div class="event-head">' + illu + ' <b>' + escapeHtml(eventName(e)) + '</b></div>' +
        '<div class="event-desc">' + info.desc + '</div>' +
        (e.doubled ? '<div class="hint">Carte <b>×2</b> : les effets sont appliqués deux fois.</div>' : '') +
        (e.type === 'poison' ? '<div class="hint">Actif jusqu\'à la prochaine phase d\'événement.</div>' : '');

    // Modal detail (used on mobile tap, and available anywhere). The title bar
    // keeps the full card name — it cannot host the ×2 seal.
    $('#event-dialog').dialog('option', 'title', e.label);
    $('#event-content').html(body);

    if (expanded) {
        // PC: full inline render (illustration + name + description).
        $inline.html(body);
    } else {
        // Mobile: emoji + name only (the illustration would eat the whole rail);
        // tapping opens the modal with the full picture and the description.
        $inline.addClass('has-event clickable')
            .css('--ev-color', EVENT_COLORS[e.type] || '#333')
            .html('<span class="ev-icon-row"><span class="ev-emoji">' + info.icon + '</span>' + x2Badge(e) + '</span>' +
                '<span class="ev-name">' + escapeHtml(eventName(e)) + '</span>')
            .attr('title', 'Événement : ' + e.label + ' (voir le détail)')
            .on('click', () => $('#event-dialog').dialog('open'));
    }
}

function renderLog(state) {
    const $log = $('#log').empty();
    state.log.slice().reverse().forEach(line => $log.append('<div class="log-line">' + escapeHtml(line) + '</div>'));

    // New lines since the last render pop as bottom toasts (both PC & mobile).
    const len = state.log.length;
    if (Game._logLen === undefined) { Game._logLen = len; return; }   // no backlog toast on first render
    if (len > Game._logLen) {
        const fresh = state.log.slice(Game._logLen);
        fresh.forEach(pushLogToast);
        // Bump the journal unread badge if the modal isn't open.
        if (!($('#log-dialog').dialog('instance') && $('#log-dialog').dialog('isOpen'))) {
            Game._logUnread = (Game._logUnread || 0) + fresh.length;
            $('#journal-badge').text(Game._logUnread > 9 ? '9+' : Game._logUnread).show();
        }
    }
    Game._logLen = len;
}

// Slide a short-lived toast in from the bottom for a new journal line. Up to
// MAX_TOASTS stay visible at once (oldest removed first).
const MAX_TOASTS = 3;
function pushLogToast(line) {
    const $wrap = $('#log-toast');
    const $t = $('<div class="log-toast-line"><i class="fas fa-scroll"></i><span>' + escapeHtml(line) + '</span></div>');
    $wrap.append($t);
    while ($wrap.children().length > MAX_TOASTS) $wrap.children().first().remove();
    requestAnimationFrame(() => $t.addClass('show'));
    setTimeout(() => { $t.removeClass('show'); setTimeout(() => $t.remove(), 400); }, 4200);
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

    // Ghost cells = every empty cell an existing tile opens toward (a potential
    // dungeon opening). They are shown at all times to reveal where the dungeon
    // can still grow. Only those adjacent to the active adventurer (on their
    // turn) are interactive; the rest are dimmer, non-clickable hints.
    const ghostMap = {};   // cellKey -> { row, col }
    keys.forEach(k => {
        const t = board[k];
        for (let dir = 0; dir < 4; dir++) {
            if (!tileOpensToward(t, dir)) continue;
            if (t.doorLocked && t.doorDir === dir) continue;
            const nr = t.row + DELTA[dir].r, nc = t.col + DELTA[dir].c;
            const nk = cellKey(nr, nc);
            if (board[nk]) continue;
            if (!ghostMap[nk]) ghostMap[nk] = { row: nr, col: nc };
        }
    });

    // Which ghost cells the active adventurer can actually use right now (same
    // condition as before). No discovery/exploration while running.
    const interactiveDir = {};   // cellKey -> dir from the active adventurer's tile
    const ac = activeChar();
    if (ac && isMyTurn() && ac.conscious && !state.pending && !(state.freeMoves > 0)) {
        const here = board[cellKey(ac.row, ac.col)];
        if (here) {
            for (let dir = 0; dir < 4; dir++) {
                if (!tileOpensToward(here, dir)) continue;
                if (here.doorLocked && here.doorDir === dir) continue;
                const nr = ac.row + DELTA[dir].r, nc = ac.col + DELTA[dir].c;
                const nk = cellKey(nr, nc);
                if (board[nk]) continue;
                if (!ghostMap[nk]) ghostMap[nk] = { row: nr, col: nc };
                interactiveDir[nk] = dir;
            }
        }
    }

    // Extend the board bounds so every ghost cell stays in view.
    Object.values(ghostMap).forEach(g => {
        minR = Math.min(minR, g.row); maxR = Math.max(maxR, g.row);
        minC = Math.min(minC, g.col); maxC = Math.max(maxC, g.col);
    });

    // Targeting mode : highlighted cells may sit outside the dungeon (a fireball
    // aimed at an outer wall), so they extend the bounds too.
    const tgt = Game.targeting;
    if (tgt && tgt.cells) tgt.cells.forEach(t => {
        minR = Math.min(minR, t.row); maxR = Math.max(maxR, t.row);
        minC = Math.min(minC, t.col); maxC = Math.max(maxC, t.col);
    });

    // Movement helper : while it is our turn (and no modal / targeting is
    // pending), every reachable neighbouring tile is outlined — white for a
    // plain move, orange when it costs 2 AP, red when it may hurt.
    const moveCls = {};
    if (ac && isMyTurn() && ac.conscious && !state.pending && !tgt) {
        const here = board[cellKey(ac.row, ac.col)];
        if (here) {
            for (let dir = 0; dir < 4; dir++) {
                const nk = cellKey(ac.row + DELTA[dir].r, ac.col + DELTA[dir].c);
                const nt = board[nk];
                if (!nt) continue;
                const cls = moveHighlightClass(nt, ac, here);
                if (cls) moveCls[nk] = cls;
            }
        }
    }

    const rows = maxR - minR + 1, cols = maxC - minC + 1;
    Game._boardMin = { minR, minC };   // used to place heal/damage fx over tokens
    const $board = $('#board').empty();
    $board.css({ width: cols * CELL + 'px', height: rows * CELL + 'px' });

    keys.forEach(k => {
        const t = board[k];
        const $tile = $('<div></div>')
            .addClass('tile kind-' + t.kind + ' state-' + t.state + (t.doorLocked ? ' door-locked' : '') +
                (moveCls[k] ? ' ' + moveCls[k] : ''))
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

        // Dragon-lair decor: chest / bones / gold / skull drawn UPRIGHT over the
        // chamber (never rotated with the tile), so it always reads correctly.
        if (t.kind === 'dragon-lair') {
            const combo = DRAGON_DECOR[(((t.uid || 0) % DRAGON_DECOR.length) + DRAGON_DECOR.length) % DRAGON_DECOR.length];
            combo.forEach((name, i) => {
                const cls = combo.length === 1 ? 'd1' : (i === 0 ? 'd2a' : 'd2b');
                $tile.append($('<div class="tile-decor ' + cls + '"></div>').css(
                    'background-image', 'url(' + ART_PATH + 'decor-' + name + '.png)'));
            });
        }

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
            const $tok = $('<span class="token dragon-token" style="background-image:url(' + portraitCardUrl('dragon') + ')"></span>');
            $tile.append($tok);
            animateIfMoved($tok, $tile, 'd' + d.id, d.row, d.col, prevPos, curPos);
        });
        state.characters.filter(c => !c.escaped && !c.dead && c.row === t.row && c.col === t.col).forEach(c => {
            const koCls = (c.conscious ? '' : ' ko') + (c.hidden ? ' tok-hidden' : '');
            // Green halo + click handler when this adventurer is a legal target
            // of the action being aimed (heal, balm, inspiration…).
            const asTarget = tgt && tgt.chars && tgt.chars.find(x => x.id === c.id);
            // Active token aura reflects the remaining action points :
            //  - blinking white while AP remain, steady once empty ;
            //  - red (overreach) after an Effort, steady red once empty.
            let activeCls = '';
            if (c.id === state.activeId) {
                activeCls = ' tok-active';
                if (state.effortUsed) activeCls += ' aura-overreach';
                if (state.ap <= 0) activeCls += ' aura-empty';
            }
            const $tok = $('<span class="token char-token' + koCls + activeCls + (asTarget ? ' tok-target' : '') +
                '" data-cid="' + c.id + '" style="background-image:url(' + portraitCardUrl(c.id) + ');border-color:' + c.color +
                '" title="' + c.name + ' (' + c.hp + '/' + c.maxHp + ')' + (c.hidden ? ' — caché' : '') + '"></span>');
            if (asTarget) $tok.on('click', (e) => { e.stopPropagation(); resolveTarget(asTarget.onPick); });
            $tile.append($tok);
            animateIfMoved($tok, $tile, 'c' + c.id, c.row, c.col, prevPos, curPos);
        });

        $tile.click(() => onTileClick(t));
        $board.append($tile);
    });

    Object.keys(ghostMap).forEach(nk => {
        const g = ghostMap[nk];
        const dir = interactiveDir[nk];
        const interactive = dir !== undefined;
        const $gh = $('<div class="tile ghost-cell"></div>')
            .css({ top: (g.row - minR) * CELL + 'px', left: (g.col - minC) * CELL + 'px', width: CELL + 'px', height: CELL + 'px' });
        if (interactive) {
            $gh.addClass('ghost-active').attr('title', 'Explorer / découvrir ici')
                .append('<div class="ghost-plus">+</div>')
                .click(() => onGhostClick(g.row, g.col, dir));
        } else {
            // Pure visual hint : a possible dungeon opening the player can't use now.
            $gh.addClass('ghost-hint').attr('title', 'Issue possible du donjon');
        }
        $board.append($gh);
    });

    // Targeted cells : a coloured overlay drawn above tiles / ghosts, clickable
    // to validate the action (replaces the old coordinate menus).
    if (tgt && tgt.cells) tgt.cells.forEach(t => {
        const $ov = $('<div class="target-cell ' + (tgt.cls || '') + '"></div>')
            .css({ top: (t.row - minR) * CELL + 'px', left: (t.col - minC) * CELL + 'px', width: CELL + 'px', height: CELL + 'px' })
            .attr('title', tgt.title);
        if (tgt.mark) $ov.append('<span class="tgt-mark">' + tgt.mark + '</span>');
        $ov.on('click', (e) => { e.stopPropagation(); resolveTarget(t.onPick); });
        $board.append($ov);
    });

    Game._tokenPos = curPos;
    renderTokenActions($board, state, ac);

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

/**
 * Out of action points : pin an "Effort" and an "End turn" button right under
 * the active token, so the turn can be wrapped up without hunting for the rail.
 * They vanish as soon as one is used — and an Effort brings them back once its
 * bonus point is spent (Effort being usable only once per turn, only "End turn"
 * comes back then).
 */
function renderTokenActions($board, state, ac) {
    if (!isMyTurn() || state.pending || Game.targeting) return;
    if (!ac || ac.escaped || ac.dead) return;
    if (state.ap > 0 || state.freeMoves > 0) return;
    const pos = tokenCenter(ac.id);
    if (!pos) return;

    const $wrap = $('<div class="tok-actions"></div>')
        .css({ left: pos.x + 'px', top: (pos.y + pos.h / 2 + 4) + 'px' });
    const add = (cls, icon, title, action) => {
        $wrap.append($('<button class="round-act tok-act ' + cls + '" title="' + title + '"><span class="act-ico">' +
            icon + '</span></button>').on('click', (e) => {
                e.stopPropagation();
                $wrap.remove();            // instant feedback, before the state round-trip
                sendAction(action, {});
            }));
    };
    if (ac.conscious && !state.effortUsed) {
        add('tok-act-effort', faIco('dumbbell'), 'Effort : +1 PA (jet de talent en fin de tour)', 'effort');
    }
    add('primary', faIco('forward-step'),
        ac.conscious ? 'Finir le tour' : 'Passer le tour (inconscient)', 'end-turn');
    $board.append($wrap);
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
        $block.append('<div class="cand-title">' + (cand.source === 'reserve' ? ABILITY_ICON['rock-memory'] + ' Réserve : ' : 'Pioche : ') + info.icon + ' ' + info.label +
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
    if (p.canReroll) buttons.push({ text: 'Repli stratégique (' + p.mulliganLeft + ')', click: () => sendAction('reroll-placement', {}) });
    buttons.push({ text: 'Annuler', click: () => { $d.dialog('close'); sendAction('cancel-placement', {}); } });
    $d.dialog('option', 'title', modeLabel + ' une tuile');
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
    // One point short and not yet exhausted: the button stays clickable and
    // offers an Effort (+1 PA) first.
    const effortAssistFor = (def) =>
        my && ac && ac.conscious && !blockedByPending && !running &&
        !state.effortUsed && def.cost > 0 && ap < def.cost && (ap + 1) >= def.cost;
    // Yellow lightning pips representing an AP cost.
    const pips = (n) => {
        let s = '';
        for (let i = 0; i < n; i++) s += '<i class="fas fa-bolt"></i>';
        return s;
    };
    // Compact: pips tucked under the icon. Expanded: pips + "PA" after the label.
    const costOverlay = (n) => n ? '<span class="ap-pips">' + pips(n) + '</span>' : '';
    const costTail = (n) => n ? '<span class="ap-cost">' + pips(n) + ' PA</span>' : '';

    // One markup for both layouts: a round icon button, which in expanded mode
    // grows a label plate welded to its right (rounded on the far side).
    const pillHtml = (icon, label, cost, extraTail) =>
        '<span class="act-ico">' + icon + '</span>' + costOverlay(cost) +
        '<span class="act-ext"><span class="act-lbl">' + escapeHtml(label) + '</span>' +
        (extraTail !== undefined ? extraTail : costTail(cost)) + '</span>';

    const buildBtn = (def, isAbility) => {
        const icon = isAbility ? (ABILITY_ICON[def.abilityId] || '✨') : (ACTION_ICON[def.action] || '');
        const $b = $('<button class="round-act act-pill">' + pillHtml(icon, def.label, def.cost) + '</button>');
        $b.attr('title', def.label + (def.cost ? ' (' + def.cost + ' PA)' : '') + (def.tip ? ' — ' + def.tip : ''));
        const normal = enabledFor(def);
        const assist = !normal && effortAssistFor(def);
        $b.prop('disabled', !(normal || assist));
        if (normal) $b.click(() => runActionMode(def.mode, def, isAbility));
        else if (assist) { $b.addClass('needs-effort'); $b.click(() => offerEffortThen(def.label, def.cost, () => runActionMode(def.mode, def, isAbility))); }
        return $b;
    };
    // Cancel button shown in place of the Run / Celerity button until a move starts.
    const buildCancelBtn = (label) => {
        const $b = $('<button class="round-act act-pill cancel-run-btn">' +
            pillHtml(faIco('rotate-left'), label, 0, '') + '</button>');
        $b.attr('title', label);
        const enabled = my && !blockedByPending && !!state.cancelRunKind;
        $b.prop('disabled', !enabled);
        if (enabled) $b.click(() => sendAction('cancel-run', {}));
        return $b;
    };
    // Passive abilities use the very same pill, with a dashed outline. They are
    // not actionable, so a tap/click just explains what they do (tooltips are
    // unreachable on touch screens).
    const buildPassiveBtn = (a) => {
        const $b = $('<button class="round-act act-pill passive-act">' +
            pillHtml(ABILITY_ICON[a.id] || '✨', a.name, 0, '<span class="ap-cost passive-tag">Passif</span>') + '</button>');
        $b.attr('title', a.name + ' (passif) — ' + a.description);
        $b.click(() => Dialog.openSimpleDialog($('#simple-dialog'),
            a.name + ' (passif)', escapeHtml(a.description), 360));
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
        ac.abilities.filter(a => a.passive).forEach(a => $abil.append(buildPassiveBtn(a)));
    }

    $('#effort-btn').prop('disabled', !my || !ac || !ac.conscious || state.effortUsed || blockedByPending);
    $('#endturn-btn').prop('disabled', !my || blockedByPending);

    // Effort / end-turn : labelled in expanded mode, icon-only when compact.
    $('#effort-btn').html('<span class="act-ico">' + faIco('dumbbell') + '</span><span class="act-lbl">Effort</span>');
    const endLbl = ac && !ac.conscious ? 'Passer le tour' : (state.interrupt ? 'Finir l\'action' : 'Finir le tour');

    if (state.status !== 'PLAYING') {
        $('#active-banner').html('<i class="fas fa-flag-checkered"></i><span class="ab-lbl"> Partie terminée</span>').attr('title', 'Partie terminée').removeClass('your-turn');
        $('#endturn-btn').attr('title', endLbl).html('<span class="act-ico">' + faIco('forward-step') + '</span><span class="act-lbl">' + endLbl + '</span>');
    } else if (my) {
        const koNote = ac && !ac.conscious ? ' (inconscient — passez votre tour)' : '';
        const inter = state.interrupt ? ' ⚡ action immédiate' : '';
        const who = 'À vous : ' + (ac ? escapeHtml(ac.name) : '');
        $('#active-banner').html('<i class="fas fa-hand-point-right"></i>' + (state.interrupt ? ' <i class="fas fa-bolt"></i>' : '') + '<span class="ab-lbl"> ' + who + '</span>')
            .attr('title', who + inter + koNote).addClass('your-turn');
        $('#endturn-btn').attr('title', endLbl).html('<span class="act-ico">' + faIco('forward-step') + '</span><span class="act-lbl">' + endLbl + '</span>');
    } else {
        const owner = escapeHtml(state.activeOwnerId || '…');
        $('#active-banner').html('<i class="fas fa-hourglass-half"></i><span class="ab-lbl"> Tour de ' + owner + '</span>')
            .attr('title', 'Tour de ' + owner + (state.interrupt ? ' (action immédiate)' : '')).removeClass('your-turn');
        $('#endturn-btn').attr('title', endLbl).html('<span class="act-ico">' + faIco('forward-step') + '</span><span class="act-lbl">' + endLbl + '</span>');
    }

    // Board hint
    if (Game.targeting) $('#board-hint').text(Game.targeting.title.replace(/<[^>]+>/g, ''));
    else if (blockedByPending && state.pending.ownerId !== Player.id) $('#board-hint').text('Un joueur place une tuile…');
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
        summary += ' · Partie terminée en ' + s.turns + ' tour' + (s.turns > 1 ? 's' : '') + '.';
    }
    $('#end-summary').text(summary);
    $('#end-duration').html(s.durationMs != null
        ? '<i class="fas fa-stopwatch"></i> Durée de la partie : <b>' + formatDuration(s.durationMs) + '</b>'
        : '');
    $ov.fadeIn(300);
}

// "1 h 04 min 09 s" / "12 min 07 s" / "48 s"
function formatDuration(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    if (h) return h + ' h ' + pad(m) + ' min ' + pad(s) + ' s';
    if (m) return m + ' min ' + pad(s) + ' s';
    return s + ' s';
}
