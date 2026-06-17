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

    Lobby.$inputs = $('#lobby-inputs');
    Lobby.$roomsList = $('#rooms-list');
    Lobby.$roomsListContent = $('#rooms-list-content');
    Lobby.$waitingRoom = $('#waiting-room');
    Lobby.$userId = $('#user-id');
    Lobby.$roomId = $('#room-id');
    Lobby.$password = $('#room-password');
    Lobby.$submit = $('#lobby-btn');
    Lobby.$startBtn = $('#start-btn');
    Lobby.$debugButton = $('#debug-button');

    $('#random-room-id-btn').click(() => Socket.emit('get-random-room-id'));

    $('#room-password-link').click(() => {
        $('#room-password-link').hide();
        $('#room-password-container').show();
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

    Lobby.$debugButton.click(() => Socket.emit('debug-toggle'));

    // Kick / unselect from players list (owner only).
    $('#wr-players-list').on('click', '.kick-btn', function (e) {
        e.stopPropagation();
        Socket.emit('kick-player', {
            roomId: Player.roomId, ownerId: Player.id, token: Player.token,
            targetId: $(this).data('target')
        });
    });
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

Socket.on('user-connected', (data) => {
    Player.id = data.id;
    Player.token = data.token;
    Player.roomId = data.roomId;
    Lobby.inRoom = true;
    Lobby.$inputs.hide();
    Lobby.$roomsList.hide();
    Lobby.$waitingRoom.show();
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
            .map(s => (room.catalog.find(c => c.id === s.charId) || {}).emoji || '').join(' ');
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
            '<div class="char-emoji" style="background:' + c.color + '">' + c.emoji + '</div>' +
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
    $b.text(data.from + ' ' + data.emoji).stop(true, true).css('opacity', 1).animate({ opacity: 1 }, 100);
    clearTimeout(Lobby._emojiTimer);
    Lobby._emojiTimer = setTimeout(() => $b.fadeTo(600, 0, () => $b.text('').css('opacity', 1)), 2500);
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

Socket.on('debug-changed', (data) => {
    Lobby.$debugButton.toggleClass('active', !!data.isDebugEnabled);
});

// Notify the server cleanly when leaving the page.
window.addEventListener('beforeunload', () => {
    if (Lobby.inRoom && Lobby.roomStatus !== STATUS.GAME_STARTED_WAITING_PLAYERS) {
        Socket.emit('player-disconnect', { userId: Player.id, roomId: Player.roomId, token: Player.token });
    }
});
