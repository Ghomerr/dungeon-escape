const Socket = io();
const Player = {};
const STATUS = {
    NOT_CONNECTED: 'NOT_CONNECTED',
    IN_LOBBY_WAITING: 'IN_LOBBY_WAITING',
    IN_LOBBY_FULL: 'IN_LOBBY_FULL',
    GAME_STARTED_WAITING_PLAYERS: 'GAME_STARTED_WAITING_PLAYERS',
    IN_GAME: 'IN_GAME',
    IN_GAME_MISSING_PLAYERS: 'IN_GAME_MISSING_PLAYERS'
};

const Lobby = { roomStatus: STATUS.NOT_CONNECTED, inRoom: false, room: null };

// Adventurer portraits: <id>.png for small pawns, <id>_portrait.png on cards.
function portraitUrl(id) { return 'static/assets/adventurers/' + id + '.png'; }
function portraitCardUrl(id) { return 'static/assets/adventurers/' + id + '_portrait.png'; }

// Short explanation of each difficulty (shown under the buttons).
const DIFFICULTY_DESC = {
    easy: 'Donjon plus court et aventuriers plus résistants. Pour découvrir le jeu ou finir une partie sereinement.',
    normal: 'Les règles de base, sans aucun aménagement. Aucun événement doublé « x2 ».',
    advanced: 'Moins de tours, et les événements « x2 » (à double effet) peuvent survenir.',
    expert: 'Le moins de tours, tous les événements possibles dont les « x2 ». Le plus exigeant.'
};

const ITEMS_DESC_ON =
    'Des <b>Potions</b> (1 tuile sur 4) rendent 1 PV au premier aventurier qui les trouve. ' +
    'Des <b>Parchemins</b> apparaissent à coup sûr quand le Paladin terrasse un Dragon, 2 fois sur 3 ' +
    'quand un Dragon renonce et disparaît, et 1 fois sur 3 en éteignant un incendie ou avec une ' +
    'Boule de feu : ils relèvent un aventurier inconscient, où qu\'il soit.';
const ITEMS_DESC_OFF = 'Potions et Parchemins pour adoucir l\'exploration. Indisponible en difficulté Expert.';

const EXTRA_DESC_OFF =
    'Le livret de Sub Terra le propose : « si vous trouvez que c\'est toujours trop difficile, ' +
    'vous pouvez ajouter 3 cartes à la pile Danger ». Rien d\'autre ne change.';

/** Bullet list of what the chosen difficulty actually changes. */
function difficultyFacts(info) {
    if (!info) return [];
    const bonus = info.extraTurns
        ? ' <span class="fact-bonus">(+' + info.extraTurns + ')</span>' : '';
    const facts = [
        '<b>' + info.turns + ' tours</b>' + bonus + ' avant la mort subite',
        'pioche de <b>' + info.tiles + ' tuiles</b> (la Sortie est parmi les 5 dernières)'
    ];
    if (info.bonusHp) facts.push('<b>+' + info.bonusHp + ' PV</b> pour chaque aventurier');
    facts.push(info.doubled
        ? 'événements <b>« x2 »</b> présents dans la pioche'
        : 'aucun événement <b>« x2 »</b>');
    if (!info.allowsItems) facts.push('objets <b>indisponibles</b> à cette difficulté');
    return facts;
}

// If we arrived back with leftover query params, clean the URL.
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('formRoomId') || urlParams.get('formUserId')) {
    window.history.replaceState({}, '', '/');
}

const INVALID_INPUT_REGEX = /[^a-zA-Z0-9\s\-_À-ÿ]/g;
function sanitize($input) {
    $input.val($input.val().replace(INVALID_INPUT_REGEX, ''));
}

$(document).ready(() => {
    Socket.emit('get-random-room-id');
    Socket.emit('get-rooms-list');

    fetch('static/version.json')
        .then(r => r.json())
        .then(d => $('#version-tag').text(d.version))
        .catch(() => {});

    // Guided-tour opt-in : purely local to this player / browser, shared with the
    // game page through the same localStorage key. Ticked by default.
    const TUTO_KEY = 'de-tutorial';
    $('#wr-tutorial')
        .prop('checked', localStorage.getItem(TUTO_KEY) !== 'off')
        .change(function () { localStorage.setItem(TUTO_KEY, this.checked ? 'on' : 'off'); });

    // Live markdown viewers (rules + changelog).
    $('#rules-link').on('click', (e) => { e.preventDefault(); Dialog.openMarkdown('rules.md', '📖 Règles du jeu'); });
    $('#version-link').on('click', () => Dialog.openMarkdown('changelog.md', '📜 Changelog'));

    Lobby.$inputs = $('#lobby-inputs');
    Lobby.$roomsList = $('#rooms-list');
    Lobby.$roomsListContent = $('#rooms-list-content');
    Lobby.$waitingRoom = $('#waiting-room');
    Lobby.$userId = $('#user-id');
    Lobby.$roomId = $('#room-id');
    Lobby.$password = $('#room-password');
    Lobby.$submit = $('#lobby-btn');
    Lobby.$startBtn = $('#start-btn');

    // Phone-only: fold the room settings away so the character grid gets the
    // screen. The button is hidden by CSS on desktop, where nothing collapses.
    $('#wr-settings-toggle').click(function () {
        const open = !$('#wr-settings').hasClass('open');
        $('#wr-settings').toggleClass('open', open);
        $(this).toggleClass('open', open).attr('aria-expanded', open ? 'true' : 'false');
    });

    // Local play history (this browser only).
    $('#history-clear').click(() => {
        Dialog.openTwoChoicesDialog(Dialog.$simpleDialog, '🗑️ Tout effacer',
            'Supprimer l\'historique de vos dernières parties ?<br>' +
            '<span class="hint">Cette action est définitive et ne concerne que ce navigateur.</span>',
            'Tout effacer', () => { writeHistory([]); renderHistory(); }, 'Annuler', null);
    });
    renderHistory();

    $('#random-room-id-btn').click(() => Socket.emit('get-random-room-id'));

    $('#room-password-link').click(() => {
        $('#room-password-link').hide();
        // Explicit flex rather than .show(): jQuery would guess `block` and the
        // padlock would lose the gap that lines the input up with the ones above.
        $('#room-password-container').css('display', 'flex');
    });

    $('#user-id, #room-id, #room-password').on('input', function () { sanitize($(this)); });
    $('#user-id, #room-id').on('keyup change', () => {
        Lobby.$submit.prop('disabled', !Lobby.$roomId.val() || !Lobby.$userId.val());
    });

    Lobby.$submit.click(() => {
        sanitize(Lobby.$userId); sanitize(Lobby.$roomId); sanitize(Lobby.$password);
        Player.id = Lobby.$userId.val();
        Player.token = window.crypto.randomUUID();
        Socket.emit('join-lobby', {
            userId: Player.id,
            roomId: Lobby.$roomId.val(),
            token: Player.token,
            password: Lobby.$password.val()
        });
    });

    Lobby.joinRoomId = (element) => {
        if (Lobby.$userId.val()) {
            Lobby.$roomId.val($(element).data('room-id'));
            Lobby.$submit.click();
        } else {
            Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Pseudonyme requis', 'Entrez d\'abord votre pseudonyme.');
        }
    };

    // Difficulty buttons (owner only — server enforces).
    $('#wr-difficulty').on('click', '.diff-btn', function () {
        Socket.emit('set-difficulty', {
            roomId: Player.roomId, ownerId: Player.id, token: Player.token,
            difficulty: $(this).data('diff')
        });
    });

    // Items variant : a room-wide setting, so it goes through the server.
    $('#wr-items').on('change', function () {
        Socket.emit('set-items-enabled', {
            roomId: Player.roomId, ownerId: Player.id, token: Player.token,
            enabled: $(this).is(':checked')
        });
    });
    $('#wr-extra-events').on('change', function () {
        Socket.emit('set-extra-events', {
            roomId: Player.roomId, ownerId: Player.id, token: Player.token,
            enabled: $(this).is(':checked')
        });
    });

    // Character selection.
    $('#wr-character-grid').on('click', '.char-card', function () {
        const charId = $(this).data('char-id');
        const mine = $(this).hasClass('mine');
        const taken = $(this).hasClass('taken');
        if (taken && !mine) return;
        Socket.emit(mine ? 'unselect-character' : 'select-character', {
            roomId: Player.roomId, userId: Player.id, token: Player.token, charId
        });
    });

    // Emojis.
    $('#wr-emoji-bar').on('click', '.emoji-send', function () {
        Socket.emit('send-emoji', { roomId: Player.roomId, userId: Player.id, emoji: $(this).data('emoji') });
    });

    Lobby.$startBtn.click(() => {
        Socket.emit('start-game', { roomId: Player.roomId, ownerId: Player.id, token: Player.token });
    });


    // Kick / unselect from players list (owner only).
    $('#wr-players-list').on('click', '.kick-btn', function (e) {
        e.stopPropagation();
        Socket.emit('kick-player', {
            roomId: Player.roomId, ownerId: Player.id, token: Player.token,
            targetId: $(this).data('target')
        });
    });

    // --- Background music ---------------------------------------------------
    // Preference is shared with the game page via localStorage; default ON
    // unless the player explicitly muted it earlier.
    const $audioControl = $('#audio-control');
    const audio = $('#bg-music')[0];
    let musicEnabled = localStorage.getItem('de-music') !== 'off';

    const setMusicIcon = (playing) => {
        $audioControl.find('i')
            .toggleClass('fa-volume-high', playing)
            .toggleClass('fa-volume-xmark', !playing);
    };

    // Autoplay is usually blocked without a prior gesture on this page, so if
    // play() is refused we start on the first interaction with the lobby.
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

// --- Socket events ---------------------------------------------------------

Socket.on('random-room-id', (roomId) => {
    if (!Lobby.inRoom) Lobby.$roomId.val('Salle ' + roomId);
});

Socket.on('rooms-status-changed', (data) => {
    if (Lobby.inRoom) { Lobby.$roomsList.hide(); return; }
    const rooms = data.roomsList;
    if (!rooms.length) { Lobby.$roomsList.hide(); return; }
    Lobby.$roomsListContent.empty();
    rooms.forEach(r => {
        const joinable = r.status === STATUS.IN_LOBBY_WAITING;
        const statusLabel = r.status === STATUS.IN_LOBBY_WAITING ? 'En attente'
            : r.status === STATUS.IN_LOBBY_FULL ? 'Complète'
            : (r.status === STATUS.IN_GAME_MISSING_PLAYERS ? 'En pause' : 'En jeu');
        const icon = joinable ? 'fa-sign-in-alt' : 'fa-ban';
        const lock = r.isPrivate ? '<i class="fas fa-lock"></i> ' : '';
        const row = $('<div class="room-line room-status-' + r.status + '">' +
            '<div class="room-name" title="' + r.usersNames + '" data-room-id="' + r.id + '">' +
            '<i class="fas ' + icon + '"></i> ' + lock + '<span>' + r.id + '</span></div>' +
            '<div class="room-info">' + r.usersCount + '/' + r.maxUsers + ' joueur(s)</div>' +
            '<div class="room-status">' + statusLabel + '</div></div>');
        if (joinable) {
            row.find('.room-name').css('cursor', 'pointer').click(function () { Lobby.joinRoomId(this); });
        }
        Lobby.$roomsListContent.append(row);
    });
    Lobby.$roomsList.show();
});

// ---------------------------------------------------------------------------
// Local history : the last finished games, written by the game page into this
// browser's localStorage. Nothing here ever reaches the server.
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'de-history';
const DIFF_LABEL = { easy: 'Facile', normal: 'Normal', advanced: 'Avancé', expert: 'Expert' };
const RANK_LABEL = { gold: '🥇 Or', silver: '🥈 Argent', bronze: '🥉 Bronze' };

function readHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
function writeHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* full / disabled */ }
}

// "12 min 07 s" — same shape as the end-of-game screen.
function fmtDuration(ms) {
    if (ms == null) return '—';
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const pad = n => (n < 10 ? '0' + n : '' + n);
    if (h) return h + ' h ' + pad(m) + ' min';
    if (m) return m + ' min ' + pad(s) + ' s';
    return s + ' s';
}
function fmtDate(ts) {
    const d = new Date(ts);
    const pad = n => (n < 10 ? '0' + n : '' + n);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
        ' à ' + pad(d.getHours()) + 'h' + pad(d.getMinutes());
}

function renderHistory() {
    const $panel = $('#history-panel');
    const list = readHistory();
    if (!list.length || Lobby.inRoom) { $panel.hide(); return; }
    const $list = $('#history-list').empty();

    list.forEach((h, i) => {
        const won = h.status === 'WON';
        const tokens = (h.characters || []).map(id =>
            '<span class="hist-token" style="background-image:url(' + portraitCardUrl(id) + ')" title="' + id + '"></span>').join('');
        const items = h.items
            ? '<span class="hist-items on" title="Potions et Parchemins activés">' +
              '<i class="fas fa-flask"></i> <i class="fas fa-scroll"></i></span>'
            : '<span class="hist-items off" title="Sans objets"><i class="fas fa-ban"></i></span>';
        const result = won
            ? '<b class="hist-win">Victoire</b> ' + (h.rank ? RANK_LABEL[h.rank] : '')
            : '<b class="hist-loss">Défaite</b>';

        const $row = $(
            '<div class="hist-row' + (won ? ' is-win' : ' is-loss') + '">' +
            '<div class="hist-when"><b>' + fmtDate(h.at) + '</b>' +
            '<span class="hist-sub"><i class="fas fa-stopwatch"></i> ' + fmtDuration(h.durationMs) + '</span></div>' +
            '<div class="hist-diff"><span class="diff-chip diff-' + h.difficulty + '">' +
            (DIFF_LABEL[h.difficulty] || h.difficulty) + '</span>' + items + '</div>' +
            '<div class="hist-team"><span class="hist-sub">' + h.players + ' joueur' + (h.players > 1 ? 's' : '') +
            ' · ' + (h.characters || []).length + ' persos</span><div class="hist-tokens">' + tokens + '</div></div>' +
            '<div class="hist-result">' + result +
            '<span class="hist-sub">' + h.escaped + ' / ' + h.total + ' sortis · ' +
            h.survivors + ' survivant' + (h.survivors > 1 ? 's' : '') + '</span></div>' +
            '<div class="hist-nums"><span><i class="fas fa-hourglass-half"></i> ' + h.turns + ' tours</span>' +
            '<span><i class="fas fa-layer-group"></i> ' + (h.tilesLeft != null ? h.tilesLeft : '—') + ' tuiles restantes</span></div>' +
            '<button class="hist-del" title="Supprimer cette ligne"><i class="fas fa-xmark"></i></button>' +
            '</div>');
        $row.find('.hist-del').click(() => {
            const cur = readHistory();
            cur.splice(i, 1);
            writeHistory(cur);
            renderHistory();
        });
        $list.append($row);
    });
    $panel.show();
}

Socket.on('user-connected', (data) => {
    Player.id = data.id;
    Player.token = data.token;
    Player.roomId = data.roomId;
    Lobby.inRoom = true;
    Lobby.$inputs.hide();
    Lobby.$roomsList.hide();
    $('#history-panel').hide();
    Lobby.$waitingRoom.show();
    // Lock the page to the viewport (mobile) so the character list scrolls under
    // a fixed room recap.
    document.body.classList.add('in-lobby-room');
    $('#wr-room-name').text(data.roomId);
});

Socket.on('players-list-changed', (room) => {
    Lobby.room = room;
    Player.roomId = room.id;
    Lobby.roomStatus = room.status;
    const isOwner = room.owner === Player.id;

    // Players list
    const $list = $('#wr-players-list').empty();
    room.users.forEach(u => {
        const crown = u.id === room.owner ? '<i class="fas fa-crown" title="Propriétaire"></i> ' : '';
        const me = u.id === Player.id ? ' (vous)' : '';
        const conn = u.isConnected === false ? ' <i class="fas fa-plug-circle-xmark" title="Déconnecté"></i>' : '';
        const owned = room.selectedCharacters.filter(s => s.ownerId === u.id)
            .map(s => {
                const c = room.catalog.find(cc => cc.id === s.charId) || {};
                return '<span class="wr-pawn" title="' + (c.name || '') + '" style="background-image:url(' +
                    portraitCardUrl(s.charId) + ');border-color:' + (c.color || '#000') + '"></span>';
            }).join('');
        const kick = (isOwner && u.id !== room.owner)
            ? ' <span class="kick-btn" data-target="' + u.id + '" title="Expulser">❌</span>' : '';
        $list.append('<li data-uid="' + u.id + '"><span class="pname">' + crown +
            '<strong>' + u.id + '</strong>' + me + conn + '</span> <span class="powned">' + owned + '</span>' + kick + '</li>');
    });

    if (isOwner) {
        $list.addClass('draggable');
        $list.sortable({
            update: () => {
                const order = [];
                $list.children().each((_i, li) => order.push($(li).data('uid') + ''));
                Socket.emit('change-players-order', {
                    roomId: room.id, ownerId: Player.id, token: Player.token, newUsersOrder: order
                });
            }
        });
    }

    // Difficulty highlight
    $('#wr-difficulty .diff-btn').removeClass('active').each(function () {
        if ($(this).data('diff') === room.difficulty) $(this).addClass('active');
        $(this).prop('disabled', !isOwner);
    });
    $('#wr-difficulty-desc').text(DIFFICULTY_DESC[room.difficulty] || DIFFICULTY_DESC.normal);
    // Recap on the collapsed settings button, so the folded state still tells
    // the player what the room is set to.
    const recap = [DIFF_LABEL[room.difficulty] || room.difficulty];
    if (room.itemsEnabled) recap.push('objets');
    if (room.extraEventsEnabled) recap.push('+3 tours');
    $('#wr-settings-recap').text(recap.join(' · '));
    $('#wr-difficulty-facts').html(
        difficultyFacts(room.difficultyInfo).map(f => '<li>' + f + '</li>').join(''));

    // Items opt-in : room-wide, owner-driven, and never available in Expert.
    const itemsAllowed = !room.difficultyInfo || room.difficultyInfo.allowsItems;
    $('#wr-items').prop('checked', !!room.itemsEnabled).prop('disabled', !isOwner || !itemsAllowed);
    $('.items-optin').toggleClass('disabled', !itemsAllowed);
    $('#wr-items-desc').html(room.itemsEnabled ? ITEMS_DESC_ON : ITEMS_DESC_OFF);

    // Rulebook concession: available everywhere, but Expert may only have room
    // for part of it — so say what it actually grants here.
    const info = room.difficultyInfo;
    $('#wr-extra-events').prop('checked', !!room.extraEventsEnabled).prop('disabled', !isOwner);
    $('#wr-extra-desc').html(room.extraEventsEnabled && info
        ? 'Actif : <b>+' + info.extraTurns + ' tour' + (info.extraTurns > 1 ? 's' : '') + '</b>, ' +
          'soit <b>' + info.turns + '</b> au total' +
          (info.extraTurns < info.maxExtraTurns
              ? ' — la pioche de cette difficulté ne peut pas en donner davantage.' : '.')
        : EXTRA_DESC_OFF);

    // Character grid
    const $grid = $('#wr-character-grid').empty();
    room.catalog.forEach(c => {
        const sel = room.selectedCharacters.find(s => s.charId === c.id);
        const taken = !!sel;
        const mine = sel && sel.ownerId === Player.id;
        const abilitiesHtml = c.abilities.map(a =>
            '<li><b>' + a.name + '</b>' + (a.passive ? ' (Passif)' : ' (' + a.cost + ' PA)') + ' — ' + a.description + '</li>').join('');
        const ownerTag = taken ? '<div class="char-owner">Choisi par ' + sel.ownerId + '</div>' : '';
        const card = $('<div class="char-card' + (taken ? ' taken' : '') + (mine ? ' mine' : '') + '" data-char-id="' + c.id + '">' +
            '<div class="char-portrait" style="background-image:url(' + portraitUrl(c.id) + ');border-color:' + c.color + '"></div>' +
            '<div class="char-name">' + c.name + '</div>' +
            '<div class="char-meta">Niv. ' + c.level + ' · ' + c.maxHp + ' PV</div>' +
            '<ul class="char-abilities">' + abilitiesHtml + '</ul>' + ownerTag + '</div>');
        $grid.append(card);
    });

    $('#wr-char-count').text('(' + room.selectedCharacters.length + '/6)');

    // Start button (owner)
    if (isOwner) {
        Lobby.$startBtn.show().prop('disabled', !room.canStartGame);
        if (room.password) $('#wr-password-info').show().text('Mot de passe : ' + room.password);
    } else {
        Lobby.$startBtn.hide();
    }
});

Socket.on('kicked', (data) => {
    if (data.targetId === Player.id) {
        Dialog.openSimpleDialog(Dialog.$simpleDialog, '👢 Expulsé', 'Vous avez été expulsé de la salle.');
        setTimeout(() => window.location.href = '/', 1500);
    }
});

Socket.on('emoji', (data) => {
    const $b = $('#wr-emoji-bubble');
    $b.html(Dialog.reactionHtml(data.from, data.emoji)).stop(true, true).css('opacity', 1).animate({ opacity: 1 }, 100);
    clearTimeout(Lobby._emojiTimer);
    Lobby._emojiTimer = setTimeout(() => $b.fadeTo(600, 0, () => $b.html('').css('opacity', 1)), 2500);
});

Socket.on('game-started', () => {
    $('#formRoomId').val(Player.roomId);
    $('#formUserId').val(Player.id);
    $('#formToken').val(Player.token);
    $('#start-content').trigger('submit');
});

Socket.on('lobby-error', (error) => {
    const M = {
        'maximum-rooms-count': 'Nombre maximum de salles atteint : ' + error.data,
        'user-already-exists': 'Ce pseudonyme est déjà pris dans la salle : ' + error.data,
        'already-in-game': 'Impossible de rejoindre une partie déjà en cours.',
        'full-lobby': 'La salle ' + error.data + ' est complète.',
        'password-error': 'Mot de passe incorrect pour ' + error.data + '.',
        'wrong-owner': 'Vous n\'êtes pas le propriétaire de la salle.',
        'wrong-room-name': 'Nom de salle invalide (1-20 caractères : A-Z, a-z, 0-9, -, _, espace).',
        'invalid-username': 'Pseudonyme invalide (1-20 caractères : A-Z, a-z, 0-9, -, _, espace).',
        'character-taken': 'Ce personnage est déjà choisi.',
        'one-per-player': 'Avec 4 joueurs ou plus, un seul personnage par joueur.',
        'max-characters': 'Maximum 6 personnages.',
        'cannot-start': 'Conditions de lancement non remplies (4 à 6 personnages, chacun contrôlé).'
    };
    Dialog.openSimpleDialog(Dialog.$simpleDialog, '⛔ Erreur', M[error.type] || ('Erreur : ' + error.type));
});

// Notify the server cleanly when leaving the page.
window.addEventListener('beforeunload', () => {
    if (Lobby.inRoom && Lobby.roomStatus !== STATUS.GAME_STARTED_WAITING_PLAYERS) {
        Socket.emit('player-disconnect', { userId: Player.id, roomId: Player.roomId, token: Player.token });
    }
});
