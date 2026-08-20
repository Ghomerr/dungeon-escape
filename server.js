const express = require('express');
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

// Load scripts
const Utils = require('./server/utils.js');
const Game = require('./server/game.js');

// Load data
const PACKAGE = require('./package.json');

// Consts
const SERVER_PORT = 8182;
const MAX_ROOMS = 10;
const MAX_PLAYERS = 6;
// How long a game stays paused (players missing, or everyone gone) before it is
// ended for good and the room is destroyed. Overridable via env for testing.
const PAUSE_TIMEOUT_MS = parseInt(process.env.PAUSE_TIMEOUT_MS, 10) || 5 * 60 * 1000;
const STATUS = {
    // shared with client.js !
    NOT_CONNECTED: 'NOT_CONNECTED',
    IN_LOBBY_WAITING: 'IN_LOBBY_WAITING',
    IN_LOBBY_FULL: 'IN_LOBBY_FULL',
    GAME_STARTED_WAITING_PLAYERS: 'GAME_STARTED_WAITING_PLAYERS',
    IN_GAME: 'IN_GAME',
    IN_GAME_MISSING_PLAYERS: 'IN_GAME_MISSING_PLAYERS'
};
// 1-20 chars
const USER_INPUT_REGEX = /^[a-zA-Z0-9\s\-_À-ÿ]{1,20}$/;

const SOCKETS = {};
const ROOMS = {};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
    const room = ROOMS[req.query.formRoomId];
    if (room && Utils.findUserByIdAndToken(room.users, req.query.formUserId, req.query.formToken)) {
        res.sendFile(path.resolve(__dirname, '.') + '/static/game.html');
    } else {
        res.sendFile(path.resolve(__dirname, '.') + '/static/main.html');
    }
});
// Service worker must be served from the site root so its scope covers the
// whole app (a file under /static/ would only control /static/).
app.get('/service-worker.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.resolve(__dirname, 'static/service-worker.js'));
});
app.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json');
    res.sendFile(path.resolve(__dirname, 'static/manifest.webmanifest'));
});
app.use(express.static(path.resolve(__dirname, '.')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoomList() {
    const roomsList = [];
    for (const [id, room] of Object.entries(ROOMS)) {
        roomsList.push({
            id: id,
            status: room.status,
            usersCount: room.users.length,
            maxUsers: MAX_PLAYERS,
            isPrivate: !!room.password,
            usersNames: room.users.map(u => u.id).join(', ')
        });
    }
    return roomsList;
}

function refreshAllRoomsStatus() {
    io.sockets.emit('rooms-status-changed', { roomsList: getRoomList() });
}

function emitPlayerListChanged(room) {
    io.to(room.id).emit('players-list-changed', {
        id: room.id,
        owner: room.owner,
        password: room.password,
        difficulty: room.difficulty,
        itemsEnabled: !!room.itemsEnabled,
        extraEventsEnabled: !!room.extraEventsEnabled,
        difficultyInfo: Game.getDifficultyInfo(
            room.difficulty, room.selectedCharacters.length, room.extraEventsEnabled),
        users: room.users.map(u => ({ id: u.id, isConnected: u.isConnected })),
        catalog: Game.getCharacterCatalog(),
        selectedCharacters: room.selectedCharacters,
        canControlMultiple: Game.canControlMultiple(room),
        canStartGame: Game.getCanStartGame(room)
    });
}

function emitGameState(room) {
    io.to(room.id).emit('game-state', Game.buildState(room));
}

// --- Pause / reconnection / room lifecycle ---------------------------------

function countMissing(room) {
    return room.users.filter(u => u.isConnected === false).length;
}

function startPauseTimer(room) {
    if (room.pauseTimeout) return;
    room.pauseTimeout = setTimeout(() => endGameByTimeout(room.id), PAUSE_TIMEOUT_MS);
}

function clearPauseTimer(room) {
    if (room.pauseTimeout) {
        clearTimeout(room.pauseTimeout);
        room.pauseTimeout = null;
    }
}

function destroyRoom(roomId) {
    const room = ROOMS[roomId];
    if (!room) return;
    clearPauseTimer(room);
    delete ROOMS[roomId];
    refreshAllRoomsStatus();
}

// Called when the game is paused too long (missing players never come back, or
// everyone left). Ends the game for good and destroys the room.
function endGameByTimeout(roomId) {
    const room = ROOMS[roomId];
    if (!room) return;
    io.to(roomId).emit('game-aborted', { reason: 'timeout' });
    destroyRoom(roomId);
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

io.on('connection', (Socket) => {
    Socket.on('get-rooms-list', () => {
        Socket.emit('rooms-status-changed', { roomsList: getRoomList() });
    });

    Socket.on('get-random-room-id', () => {
        Socket.emit('random-room-id', Utils.randomRoomId());
    });

    // --- Lobby --------------------------------------------------------------

    Socket.on('join-lobby', (data) => {
        if (!data.roomId || !USER_INPUT_REGEX.test(data.roomId)) {
            Socket.emit('lobby-error', { type: 'wrong-room-name' });
            return;
        }
        if (!data.userId || !USER_INPUT_REGEX.test(data.userId)) {
            Socket.emit('lobby-error', { type: 'invalid-username' });
            return;
        }

        SOCKETS[Socket.id] = { userId: data.userId, roomId: data.roomId, token: data.token };

        if (!ROOMS[data.roomId]) {
            if (Object.keys(ROOMS).length >= MAX_ROOMS) {
                Socket.emit('lobby-error', { type: 'maximum-rooms-count', data: MAX_ROOMS });
                return;
            }
            const newRoom = {
                id: data.roomId,
                status: STATUS.IN_LOBBY_WAITING,
                owner: data.userId,
                password: data.password || '',
                users: [],
                missingPlayers: 0
            };
            ROOMS[data.roomId] = newRoom;
            Game.initLobbyData(newRoom);
        }

        const room = ROOMS[data.roomId];
        if (room.status !== STATUS.IN_LOBBY_WAITING && room.status !== STATUS.IN_LOBBY_FULL) {
            Socket.emit('lobby-error', { type: 'already-in-game' });
            return;
        }
        if (room.users.length >= MAX_PLAYERS) {
            Socket.emit('lobby-error', { type: 'full-lobby', data: data.roomId });
            return;
        }
        if (room.password && data.password !== room.password) {
            Socket.emit('lobby-error', { type: 'password-error', data: data.roomId });
            return;
        }
        if (Utils.findElementById(room.users, data.userId)) {
            Socket.emit('lobby-error', { type: 'user-already-exists', data: data.userId });
            return;
        }

        const newUser = { id: data.userId, token: data.token, isConnected: true };
        room.users.push(newUser);
        Socket.join(data.roomId);
        if (room.users.length === MAX_PLAYERS) room.status = STATUS.IN_LOBBY_FULL;

        Socket.emit('user-connected', { id: newUser.id, token: newUser.token, roomId: data.roomId });
        emitPlayerListChanged(room);
        refreshAllRoomsStatus();
    });

    function requireOwner(data, cb) {
        const room = ROOMS[data.roomId];
        if (!room) return;
        const owner = Utils.findUserByIdAndToken(room.users, data.ownerId, data.token);
        if (owner && room.owner === data.ownerId) {
            cb(room);
        } else {
            Socket.emit('lobby-error', { type: 'wrong-owner' });
        }
    }

    Socket.on('change-players-order', (data) => {
        requireOwner(data, (room) => {
            room.users.sort((u1, u2) =>
                data.newUsersOrder.indexOf(u1.id) - data.newUsersOrder.indexOf(u2.id));
            emitPlayerListChanged(room);
        });
    });

    Socket.on('kick-player', (data) => {
        requireOwner(data, (room) => {
            if (data.targetId === room.owner) return;
            room.users = room.users.filter(u => u.id !== data.targetId);
            room.selectedCharacters = room.selectedCharacters.filter(s => s.ownerId !== data.targetId);
            if (room.status === STATUS.IN_LOBBY_FULL && room.users.length < MAX_PLAYERS) {
                room.status = STATUS.IN_LOBBY_WAITING;
            }
            io.to(room.id).emit('kicked', { targetId: data.targetId });
            emitPlayerListChanged(room);
            refreshAllRoomsStatus();
        });
    });

    Socket.on('set-difficulty', (data) => {
        requireOwner(data, (room) => {
            Game.setDifficulty(room, data.difficulty);
            emitPlayerListChanged(room);
        });
    });

    Socket.on('set-items-enabled', (data) => {
        requireOwner(data, (room) => {
            const res = Game.setItemsEnabled(room, data.enabled);
            if (!res.ok) Socket.emit('lobby-error', { type: res.error });
            emitPlayerListChanged(room);
        });
    });

    Socket.on('set-extra-events', (data) => {
        requireOwner(data, (room) => {
            Game.setExtraEvents(room, data.enabled);
            emitPlayerListChanged(room);
        });
    });

    Socket.on('select-character', (data) => {
        const room = ROOMS[data.roomId];
        if (!room) return;
        const user = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
        if (!user) return;
        const res = Game.addSelection(room, data.charId, data.userId);
        if (!res.ok) Socket.emit('lobby-error', { type: res.error });
        emitPlayerListChanged(room);
    });

    Socket.on('unselect-character', (data) => {
        const room = ROOMS[data.roomId];
        if (!room) return;
        const user = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
        if (!user) return;
        Game.removeSelection(room, data.charId, data.userId, room.owner === data.userId);
        emitPlayerListChanged(room);
    });

    Socket.on('send-emoji', (data) => {
        const room = ROOMS[data.roomId];
        if (!room) return;
        io.to(room.id).emit('emoji', { from: data.userId, emoji: data.emoji });
    });

    Socket.on('start-game', (data) => {
        requireOwner(data, (room) => {
            if (!Game.getCanStartGame(room)) {
                Socket.emit('lobby-error', { type: 'cannot-start' });
                return;
            }
            room.status = STATUS.GAME_STARTED_WAITING_PLAYERS;
            io.to(room.id).emit('game-started');
            refreshAllRoomsStatus();
        });
    });

    // --- Game ---------------------------------------------------------------

    Socket.on('join-game', (data) => {
        const room = ROOMS[data.roomId];
        if (!room) { Socket.emit('join-game-error'); return; }
        Socket.join(room.id);
        SOCKETS[Socket.id] = { userId: data.userId, roomId: data.roomId, token: data.token };

        const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
        if (!player) { Socket.emit('join-game-error'); return; }
        player.isConnected = true;

        if (room.status === STATUS.GAME_STARTED_WAITING_PLAYERS) {
            const ready = room.users.filter(u => u.isConnected).length;
            const total = room.users.length;
            if (ready < total) {
                io.to(room.id).emit('ready-players-amount', { readyPlayersAmout: ready, totalPlayers: total });
            } else {
                room.status = STATUS.IN_GAME;
                Game.initGame(room);
                io.to(room.id).emit('all-players-ready-to-play');
                emitGameState(room);
            }
        } else if (room.status === STATUS.IN_GAME_MISSING_PLAYERS) {
            // A player returned (same id + token) : resume once everyone is back.
            room.missingPlayers = countMissing(room);
            if (room.missingPlayers === 0) {
                room.status = STATUS.IN_GAME;
                clearPauseTimer(room);
            }
            io.to(room.id).emit('in-game-player-connected', {
                playerId: player.id, owner: room.owner,
                status: room.status, missingPlayers: room.missingPlayers,
                missingNames: room.users.filter(u => !u.isConnected).map(u => u.id)
            });
            emitGameState(room);
        } else if (room.status === STATUS.IN_GAME) {
            emitGameState(room);
        }
        refreshAllRoomsStatus();
    });

    Socket.on('game-action', (data) => {
        const room = ROOMS[data.roomId];
        if (!room || !room.game) return;
        // No actions while the game is paused (a player is missing).
        if (room.status !== STATUS.IN_GAME) return;
        const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
        if (!player) return;
        const res = Game.applyAction(room, data.userId, data.action, data.payload);
        if (!res.ok && res.error) {
            Socket.emit('game-error', { error: res.error });
        }
        emitGameState(room);
    });

    Socket.on('request-game-state', (data) => {
        const room = ROOMS[data.roomId];
        if (room && room.game) emitGameState(room);
    });

    // The host may end a paused (or running) game early : everyone is expelled.
    Socket.on('end-game-early', (data) => {
        requireOwner(data, (room) => {
            if (room.status !== STATUS.IN_GAME && room.status !== STATUS.IN_GAME_MISSING_PLAYERS) return;
            io.to(room.id).emit('game-aborted', { reason: 'host-ended' });
            destroyRoom(room.id);
        });
    });

    // --- Disconnect ---------------------------------------------------------

    Socket.on('player-disconnect', (data) => {
        if (data) handleDisconnect(data, Socket);
    });

    Socket.on('disconnect', () => {
        const data = SOCKETS[Socket.id];
        if (data) handleDisconnect(data, Socket);
    });
});

function handleDisconnect(data, Socket) {
    delete SOCKETS[Socket.id];
    const room = ROOMS[data.roomId];
    if (!room) return;
    const player = Utils.findUserByIdAndToken(room.users, data.userId, data.token);
    if (!player) return;

    switch (room.status) {
        case STATUS.GAME_STARTED_WAITING_PLAYERS:
            player.isConnected = false;
            break;
        case STATUS.IN_LOBBY_WAITING:
        case STATUS.IN_LOBBY_FULL: {
            const index = Utils.findIndexById(room.users, data.userId);
            if (index >= 0) room.users.splice(index, 1);
            room.selectedCharacters = (room.selectedCharacters || []).filter(s => s.ownerId !== data.userId);
            if (room.users.length === 0) {
                delete ROOMS[data.roomId];
            } else {
                if (room.owner === data.userId) room.owner = room.users[0].id; // hand over ownership
                if (room.status === STATUS.IN_LOBBY_FULL && room.users.length < MAX_PLAYERS) {
                    room.status = STATUS.IN_LOBBY_WAITING;
                }
                emitPlayerListChanged(room);
            }
            break;
        }
        case STATUS.IN_GAME:
        case STATUS.IN_GAME_MISSING_PLAYERS:
            player.isConnected = false;
            room.missingPlayers = countMissing(room);
            if (room.missingPlayers > 0) {
                // Pause the game and keep the room alive (even if EVERYONE left):
                // it only ends after PAUSE_TIMEOUT_MS, or resumes if players return.
                room.status = STATUS.IN_GAME_MISSING_PLAYERS;
                startPauseTimer(room);
                io.to(data.roomId).emit('player-left-the-room', {
                    playerId: player.id, owner: room.owner,
                    status: room.status, missingPlayers: room.missingPlayers,
                    missingNames: room.users.filter(u => !u.isConnected).map(u => u.id)
                });
            }
            break;
    }
    refreshAllRoomsStatus();
}

const port = process.env.PORT || SERVER_PORT;
http.listen(port, () => {
    console.log('Dungeon Escape server (' + PACKAGE.version + ') listening on http://localhost:' + port);
});
