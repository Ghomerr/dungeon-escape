/**
 * Dungeon Escape - game engine.
 *
 * All game state lives on room.game. Socket wiring lives in server.js, which
 * calls these functions and re-broadcasts buildState() to the room.
 */
const Utils = require('./utils.js');
const Tiles = require('./tiles.js');
const Events = require('./events.js');
const CHARACTERS = require('./characters.js');

const MAX_DRAGONS = 3;
const LOCKPICK_KITS = 6;
const FIREBALL_USES = 3;
const MULLIGAN_USES = 3;
const DRAGON_RANGE = 7;
// Dragons cannot cross the cave walls, but ledges, drops, floods, rubble and
// squeezes never constrain them — so a locked door does NOT stop a Dragon.
const DRAGON_PATH = { ignoreDoors: true };

const PHASE = { ACTION: 'ACTION', DRAGON: 'DRAGON', EVENT: 'EVENT', END: 'END' };
const GAME_STATUS = { PLAYING: 'PLAYING', WON: 'WON', LOST: 'LOST' };

// ---------------------------------------------------------------------------
// Lobby-side data (character selection + difficulty)
// ---------------------------------------------------------------------------

function initLobbyData(room) {
    room.selectedCharacters = []; // [{ charId, ownerId }]
    room.difficulty = 'normal';
}

function humansCount(room) {
    return room.users.filter(u => !u.isRobot).length;
}

// A player can control several characters only when there are fewer than
// 4 human players (otherwise: one character per player). Always allow it solo.
function canControlMultiple(room) {
    return humansCount(room) < 4;
}

function getCharacterCatalog() {
    return CHARACTERS.map(c => ({
        id: c.id,
        name: c.name,
        level: c.level,
        maxHp: c.maxHp,
        emoji: c.emoji,
        color: c.color,
        abilities: c.abilities
    }));
}

function addSelection(room, charId, ownerId) {
    if (!CHARACTERS.find(c => c.id === charId)) return { ok: false, error: 'unknown-character' };
    if (room.selectedCharacters.find(s => s.charId === charId)) return { ok: false, error: 'character-taken' };
    const ownedByUser = room.selectedCharacters.filter(s => s.ownerId === ownerId).length;
    if (ownedByUser >= 1 && !canControlMultiple(room)) return { ok: false, error: 'one-per-player' };
    if (room.selectedCharacters.length >= 6) return { ok: false, error: 'max-characters' };
    room.selectedCharacters.push({ charId, ownerId });
    return { ok: true };
}

function removeSelection(room, charId, requesterId, isOwner) {
    const sel = room.selectedCharacters.find(s => s.charId === charId);
    if (!sel) return { ok: false, error: 'not-selected' };
    if (sel.ownerId !== requesterId && !isOwner) return { ok: false, error: 'not-yours' };
    room.selectedCharacters = room.selectedCharacters.filter(s => s.charId !== charId);
    return { ok: true };
}

function setDifficulty(room, difficulty) {
    if (['normal', 'advanced', 'expert'].includes(difficulty)) {
        room.difficulty = difficulty;
        return { ok: true };
    }
    return { ok: false, error: 'bad-difficulty' };
}

function getCanStartGame(room) {
    const n = room.selectedCharacters.length;
    // Every connected human must control at least one character.
    const owners = new Set(room.selectedCharacters.map(s => s.ownerId));
    const everyoneHasOne = room.users.every(u => u.isRobot || owners.has(u.id));
    return n >= 4 && n <= 6 && everyoneHasOne;
}

// ---------------------------------------------------------------------------
// Game initialisation
// ---------------------------------------------------------------------------

function initGame(room) {
    const deck = Utils.shuffle(Tiles.buildDeck());

    // Shuffle the Exit tile among the last 5 tiles of the draw pile.
    const exitTile = Tiles.createExitTile();
    const insertPos = deck.length - Math.floor(Math.random() * 5); // among last 5
    deck.splice(insertPos, 0, exitTile);

    // Build adventurer instances from the lobby selection.
    const start = Tiles.createStartTile();
    const characters = room.selectedCharacters.map(sel => {
        const base = CHARACTERS.find(c => c.id === sel.charId);
        return {
            id: base.id,
            charId: base.id,
            name: base.name,
            emoji: base.emoji,
            color: base.color,
            level: base.level,
            maxHp: base.maxHp,
            hp: base.maxHp,
            flags: base.flags,
            abilities: base.abilities,
            ownerId: sel.ownerId,
            row: 0,
            col: 0,
            conscious: true,
            escaped: false,
            dead: false,
            hidden: false,
            hideStreak: 0,
            hideRound: null,    // last round "Se cacher" was used (streak tracking)
            shadowOut: false,
            bonusAp: 0,
            uses: { fireball: 0, mulligan: 0 }
        };
    });

    // Order characters by level (lowest first) as a stable, fair default.
    characters.sort((a, b) => a.level - b.level);

    const eventDeck = Events.buildEventDeckForGame(characters.length, room.difficulty, Utils.shuffle);

    room.game = {
        status: GAME_STATUS.PLAYING,
        difficulty: room.difficulty,
        startedAt: Date.now(),  // wall-clock start, reported in the end screen
        deck,
        board: { '0,0': start },
        reserveTile: deck.length ? deck.shift() : null, // Dwarf's "Rock memory" face-up tile
        characters,
        order: characters.map(c => c.id),
        firstIndex: 0,
        queue: [],
        activeId: null,
        ap: 0,
        freeMoves: 0,
        freeMoveGrant: null,    // cancelable Run / Animal Celerity grant (until the first move)
        effortUsed: false,
        round: 0,
        phase: PHASE.ACTION,
        pending: null,          // an in-progress tile placement awaiting confirmation
        interruptStack: [],     // saved turn contexts (Bard's Inspiration)
        eventDeck,
        eventsTotal: eventDeck.length,
        eventsResolved: 0,
        suddenDeath: false,
        currentEvent: null,
        poisonedCells: [],     // cells currently poisoned (cleared each event phase)
        dragons: [],
        dragonSeq: 1,
        lockpickKits: LOCKPICK_KITS,
        fx: [],                // client-side feedback queue (toasts / animations)
        fxSeq: 0,
        log: []
    };

    pushLog(room, '🗝️ La partie commence ! Difficulté : ' + difficultyLabel(room.difficulty) +
        ' — ' + room.game.eventsTotal + ' tours avant la mort subite.');
    startRound(room);
}

function difficultyLabel(d) {
    return d === 'expert' ? 'Expert' : d === 'advanced' ? 'Avancé' : 'Normal';
}

function pushLog(room, message) {
    room.game.log.push(message);
    if (room.game.log.length > 60) room.game.log.shift();
}

/**
 * Queue a one-shot visual feedback for the clients (big toast, board animation).
 * Each entry carries an increasing `seq` so a client only plays what it has not
 * seen yet — and a reconnecting client simply skips the backlog.
 */
function pushFx(room, fx) {
    const g = room.game;
    fx.seq = ++g.fxSeq;
    g.fx.push(fx);
    if (g.fx.length > 12) g.fx.shift();
}

// ---------------------------------------------------------------------------
// Round / turn flow
// ---------------------------------------------------------------------------

function consciousInDungeon(g) {
    return g.characters.filter(c => c.conscious && !c.escaped && !c.dead);
}

function startRound(room) {
    const g = room.game;
    g.round++;
    g.phase = PHASE.ACTION;

    // Build the play queue starting at firstIndex. Only the dead drop out :
    // adventurers who reached the Exit keep playing (they may head back in).
    const ordered = [];
    for (let i = 0; i < g.order.length; i++) {
        const id = g.order[(g.firstIndex + i) % g.order.length];
        const c = getChar(g, id);
        if (!c.dead) ordered.push(id);
    }
    g.queue = ordered;
    g.roundStartCount = ordered.length; // adventurers scheduled to play this round
    pushLog(room, '— Tour ' + g.round + ' —');

    // Hiding lasts for the WHOLE round it was gained in : it must still protect
    // during the Dragon phase AND the following bad-event phase (a Dragon event
    // moves / spawns dragons too). So it is only cleared here, when the next
    // round actually starts.
    const wasHidden = g.characters.filter(c => c.hidden && !c.escaped && !c.dead);
    if (wasHidden.length) {
        for (const c of wasHidden) c.hidden = false;
        pushLog(room, '👀 ' + wasHidden.map(c => c.name).join(', ') +
            (wasHidden.length > 1 ? ' ne sont plus cachés.' : ' n\'est plus caché.'));
    }

    activateNext(room);
}

function activateNext(room) {
    const g = room.game;

    // Stop as soon as no conscious adventurer remains in the dungeon.
    if (checkGameEnd(room)) return;

    if (g.queue.length === 0) {
        // All characters have acted : dragon phase, then event phase.
        runDragonPhase(room);
        if (checkGameEnd(room)) return;
        runEventPhase(room);
        if (checkGameEnd(room)) return;
        // End of turn : pass the first-player marker clockwise.
        g.firstIndex = (g.firstIndex + 1) % g.order.length;
        startRound(room);
        return;
    }

    const id = g.queue[0];
    const c = getChar(g, id);
    g.activeId = id;
    g.phase = PHASE.ACTION;
    g.effortUsed = false;
    g.freeMoves = 0;
    g.freeMoveGrant = null;

    if (!c.conscious) {
        g.ap = 0;
        pushLog(room, '💤 ' + c.name + ' est inconscient et passe son tour.');
    } else if (c.shadowOut) {
        // Back from the shadows is the WHOLE turn : no action point to spend,
        // reappearing is all this adventurer may do.
        g.ap = 0;
        c.bonusAp = 0;
        pushLog(room, '🌒 ' + c.name + ' est dans l\'ombre : réapparaître est sa seule action.');
    } else {
        g.ap = 2 + (c.bonusAp || 0);
        c.bonusAp = 0;
    }
}

function endTurn(room) {
    const g = room.game;
    const c = getChar(g, g.activeId);

    // Effort : a talent roll, losing 1 HP on failure.
    if (g.effortUsed && c && c.conscious) {
        const roll = talent(c);
        if (!roll.success) {
            pushLog(room, '😓 ' + c.name + ' rate son effort (dé ' + roll.value + ') et perd 1 PV.');
            applyDamage(room, c, 1);
        } else {
            pushLog(room, '💪 ' + c.name + ' réussit son effort (dé ' + roll.value + ').');
        }
    }

    if (checkGameEnd(room)) return;

    // Bard's Inspiration : return control to the interrupted character.
    if (g.interruptStack.length > 0) {
        const ctx = g.interruptStack.pop();
        g.activeId = ctx.activeId;
        g.ap = ctx.ap;
        g.freeMoves = ctx.freeMoves;
        g.freeMoveGrant = ctx.freeMoveGrant;
        g.effortUsed = ctx.effortUsed;
        g.phase = PHASE.ACTION;
        const back = getChar(g, g.activeId);
        pushLog(room, '↩️ Retour au tour de ' + (back ? back.name : '?') + '.');
        return;
    }

    g.queue.shift();
    if (checkGameEnd(room)) return;
    activateNext(room);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChar(g, id) {
    return g.characters.find(c => c.id === id);
}

function talent(char, extra = 0) {
    const bonus = (char.flags && char.flags.luck ? 1 : 0) + extra;
    return Utils.talentRoll(bonus);
}

function tileAt(g, row, col) {
    return Utils.getTileAt(g.board, row, col);
}

/** A Pénombre tile, dark or not — the Shadow Hunter's entry and exit points. */
function isShadowTile(tile) {
    return !!tile && (tile.kind === 'gloom' || tile.state === 'dark');
}

// Adventurers physically standing on a cell. A Shadow Hunter who used "Marche de
// l'Ombre" has left the board (its figure sits on the character sheet), so no
// tile effect can reach it.
function charsOnCell(g, row, col) {
    return g.characters.filter(c => !c.escaped && !c.dead && !c.shadowOut &&
        c.row === row && c.col === col);
}

function paladinProtects(g, row, col, exceptId) {
    // A conscious Paladin on the cell protects the OTHER adventurers there.
    return g.characters.some(c =>
        c.id !== exceptId && c.conscious && !c.escaped && !c.dead &&
        c.flags.sacrifice && c.row === row && c.col === col);
}

function applyDamage(room, char, amount) {
    if (amount <= 0 || char.escaped || char.dead) return;
    char.hp = Math.max(0, char.hp - amount);
    if (char.hp === 0 && char.conscious) {
        char.conscious = false;
        char.hidden = false;
        pushLog(room, '🩸 ' + char.name + ' tombe inconscient !');
    }
}

function healChar(room, char, amount) {
    // Adventurers on the Exit cannot be hurt, but they can still be patched up.
    if (char.dead) return;
    const wasUnconscious = !char.conscious;
    char.hp = Math.min(char.maxHp, char.hp + amount);
    if (char.hp > 0 && wasUnconscious) {
        char.conscious = true;
        pushLog(room, '✨ ' + char.name + ' reprend connaissance !');
    }
}

// ---------------------------------------------------------------------------
// Action validation entry point
// ---------------------------------------------------------------------------

/**
 * Apply an action requested by `userId` for the active character.
 * Returns { ok, error?, log? }.
 */
function applyAction(room, userId, action, payload) {
    const g = room.game;
    if (!g || g.status !== GAME_STATUS.PLAYING) return { ok: false, error: 'game-over' };

    const c = getChar(g, g.activeId);
    if (!c) return { ok: false, error: 'no-active' };
    if (c.ownerId !== userId) return { ok: false, error: 'not-your-turn' };

    payload = payload || {};

    // While a tile placement is pending, only placement actions are allowed.
    if (g.pending) {
        if (action === 'confirm-placement') return confirmPlacement(room, c, payload);
        if (action === 'cancel-placement') return cancelPlacement(room, c);
        if (action === 'reroll-placement') return rerollPlacement(room, c);
        return { ok: false, error: 'finish-placement' };
    }

    // Passing / ending the turn is always allowed.
    if (action === 'end-turn') { endTurn(room); return { ok: true }; }
    if (action === 'pass') { endTurn(room); return { ok: true }; }

    if (!c.conscious) return { ok: false, error: 'unconscious' };

    // Off the board in the shadows: reappearing is the only legal move.
    if (c.shadowOut && action !== 'shadow-return') return { ok: false, error: 'in-shadow' };

    if (action === 'effort') {
        if (g.effortUsed) return { ok: false, error: 'effort-used' };
        g.effortUsed = true;
        g.ap += 1;
        pushLog(room, '🔥 ' + c.name + ' fait un effort exceptionnel (+1 PA).');
        return { ok: true };
    }

    const handler = ACTIONS[action];
    if (!handler) return { ok: false, error: 'unknown-action' };

    const result = handler(room, c, payload);
    if (result && result.ok) {
        checkGameEnd(room);
        // The turn is never auto-ended : the player may still use Effort,
        // free moves, or another action, and ends the turn explicitly.
    }
    return result || { ok: false, error: 'failed' };
}

function spendAp(g, n) { g.ap -= n; }

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function canEnterByMove(char, tile) {
    if (!tile) return false;
    if (tile.state === 'fire') return char.flags.elvenAgility === true;
    if (tile.state === 'dark') return char.flags.nightVision === true;
    if (tile.kind === 'bridge') return char.flags.elvenAgility === true;
    if (tile.kind === 'gloom' && tile.state === 'dark') return char.flags.nightVision === true;
    return true;
}

/**
 * Resolve entering a tile : exit, traps, poison, fire (when forced in).
 * `free` = no entering hazard applied for the move itself (e.g. elf agility).
 */
function enterTile(room, char, tile, opts = {}) {
    // The first movement of a Run / Animal Celerity locks it in (no more cancel).
    room.game.freeMoveGrant = null;
    char.row = tile.row;
    char.col = tile.col;

    // `escaped` means "currently standing on the Exit tile" — the rulebook keeps
    // the figure in play there (immune, untargetable) rather than removing it,
    // so an adventurer may walk back into the dungeon to rescue a friend.
    const wasOnExit = char.escaped;
    char.escaped = tile.kind === 'exit';

    if (char.escaped) {
        pushLog(room, '🏃 ' + char.name + ' atteint la SORTIE, à l\'abri du Donjon !');
        return;
    }
    if (wasOnExit) {
        pushLog(room, '🚪 ' + char.name + ' quitte la SORTIE et repart dans le Donjon !');
    }

    // Stepping onto a Dragon's tile is an instant knock-out (rules: sharing a
    // tile with a Dragon => 0 HP + unconscious), whatever brought the adventurer
    // here. The Gnome's stealth (dragonImmune) exempts it. Nothing else matters
    // once terrassé, so resolve it before traps / poison / fire.
    if (!char.flags.dragonImmune &&
        room.game.dragons.some(dr => dr.row === tile.row && dr.col === tile.col)) {
        knockOutCharsOnCell(room, tile.row, tile.col);
        return;
    }

    const protectedByPal = paladinProtects(room.game, tile.row, tile.col, char.id);

    // Trapped plate : talent roll or lose 1 HP.
    if (tile.kind === 'trap' && !opts.skipTrap) {
        const roll = talent(char);
        if (!roll.success) {
            pushLog(room, '⚙️ ' + char.name + ' déclenche une plaque piégée (dé ' + roll.value + ') et perd 1 PV.');
            applyDamage(room, char, 1);
        } else {
            pushLog(room, '⚙️ ' + char.name + ' évite la plaque piégée (dé ' + roll.value + ').');
        }
    }

    // Poisoned tile (active poison event). Elven agility does NOT protect here.
    if (tile.state === 'poisoned') {
        if (protectedByPal) {
            pushLog(room, '🛡️ ' + char.name + ' est protégé du poison par le Paladin.');
        } else {
            pushLog(room, '☠️ ' + char.name + ' entre dans une tuile empoisonnée et perd 2 PV.');
            applyDamage(room, char, 2);
        }
    }

    // Forced onto a fire tile (elf agility) : elf takes no damage.
    if (tile.state === 'fire' && !char.flags.elvenAgility) {
        const dmg = char.flags.fireResist ? 1 : 3;
        applyDamage(room, char, dmg);
        pushLog(room, '🔥 ' + char.name + ' traverse les flammes et perd ' + dmg + ' PV.');
    }
}

function doMove(room, char, payload, opts = {}) {
    const g = room.game;
    const dir = payload.dir;
    if (dir === undefined || dir === null) return { ok: false, error: 'no-direction' };
    const here = tileAt(g, char.row, char.col);
    if (!Utils.edgeConnected(g.board, here, dir)) return { ok: false, error: 'no-connection' };

    const d = Tiles.DELTA[dir];
    const target = tileAt(g, char.row + d.row, char.col + d.col);
    if (!target) return { ok: false, error: 'no-tile' };

    // Special tiles need their dedicated action (unless ability bypass).
    if (!opts.anyTile && !canEnterByMove(char, target)) {
        if (target.kind === 'bridge') return { ok: false, error: 'need-bridge-action' };
        if (target.state === 'dark') return { ok: false, error: 'need-dark-action' };
        if (target.state === 'fire') return { ok: false, error: 'fire-blocks' };
        return { ok: false, error: 'blocked' };
    }

    // Spend a free move first (Run / Celerity), otherwise an action point.
    const cost = opts.cost !== undefined ? opts.cost : 1;
    if (g.freeMoves > 0 && cost === 1 && !opts.forceAp) {
        g.freeMoves -= 1;
    } else {
        if (g.ap < cost) return { ok: false, error: 'no-ap' };
        spendAp(g, cost);
    }

    enterTile(room, char, target, { elf: opts.elf });
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Discovery / exploration
// ---------------------------------------------------------------------------

/**
 * Step 1 of discovery/exploration : validate the direction and draw a tile,
 * then store a pending placement. No AP is spent until confirmation, so the
 * player can choose the tile orientation (and, for the Dwarf, which tile).
 */
function beginPlacement(mode) {
    return function (room, char, payload) {
        const g = room.game;
        // During a Run / Animal Celerity only movement is allowed.
        if (g.freeMoves > 0) return { ok: false, error: 'run-move-only' };
        if (g.ap < 1) return { ok: false, error: 'no-ap' };
        const dir = payload.dir;
        if (dir === undefined || dir === null) return { ok: false, error: 'no-direction' };

        const here = tileAt(g, char.row, char.col);
        if (!Utils.tileOpensToward(here, dir)) return { ok: false, error: 'no-exit-here' };
        if (here.doorLocked && here.doorDir === dir) return { ok: false, error: 'door-blocks' };

        const d = Tiles.DELTA[dir];
        const nr = char.row + d.row, nc = char.col + d.col;
        if (tileAt(g, nr, nc)) return { ok: false, error: 'occupied' };
        if (!g.deck.length) return { ok: false, error: 'empty-deck' };

        const deckTile = g.deck.shift();
        g.pending = {
            mode,
            charId: char.id,
            dir,
            nr,
            nc,
            cost: 1,
            deckTile,
            reserveOffered: !!(char.flags.rockMemory && g.reserveTile)
        };
        return { ok: true };
    };
}

/**
 * Distinct orientations a tile may take at cell (nr,nc) when discovered in
 * direction `dir` from the source.
 *
 * The ONLY rule is the rulebook's: "il est possible de choisir l'orientation de
 * la tuile, pourvu qu'une connexion soit réalisée" — the tile must connect back
 * to the tile the adventurer is standing on. A corridor that ends up facing a
 * neighbour's wall is perfectly legal (the two tiles simply are not connected,
 * which `edgeConnected` already handles); forbidding it used to silently strip
 * the player of orientations that open onto unexplored space.
 *
 * Orientations that also line up with every adjacent placed tile are listed
 * FIRST, so the default proposed by the client stays the tidy one.
 */
function orientationsForPlacement(g, shape, nr, nc, dir) {
    const base = Tiles.BASE_EXITS[shape] || [0];
    const opp = Tiles.opposite(dir);
    // For each side, whether the adjacent placed tile opens toward our cell.
    const neighbourOpens = {};
    for (let d = 0; d < 4; d++) {
        const nb = tileAt(g, nr + Tiles.DELTA[d].row, nc + Tiles.DELTA[d].col);
        if (nb) neighbourOpens[d] = Utils.tileOpensToward(nb, Tiles.opposite(d));
    }
    const seen = {};
    const out = [];
    for (let r = 0; r < 4; r++) {
        const exits = base.map(e => (e + r) % 4).sort((a, b) => a - b);
        const key = exits.join(',');
        if (seen[key]) continue;
        if (!exits.includes(opp)) continue; // must connect back to the source
        seen[key] = true;
        let mismatches = 0;
        for (const d of Object.keys(neighbourOpens)) {
            if (exits.includes(Number(d)) !== neighbourOpens[d]) mismatches++;
        }
        out.push({ rotation: r, exits, mismatches });
    }
    out.sort((a, b) => a.mismatches - b.mismatches);
    return out.map(o => ({ rotation: o.rotation, exits: o.exits }));
}

/** Step 2 : finalize the placement with the chosen tile + orientation. */
function confirmPlacement(room, char, payload) {
    const g = room.game;
    const p = g.pending;
    if (!p || p.charId !== char.id) return { ok: false, error: 'no-pending' };

    const source = payload.source === 'reserve' && p.reserveOffered ? 'reserve' : 'deck';
    let tile, newReserve;
    if (source === 'reserve') {
        tile = g.reserveTile;
        newReserve = p.deckTile; // the drawn tile becomes the new face-up reserve
    } else {
        tile = p.deckTile;
    }

    // Validate the chosen rotation; fall back to the first valid orientation.
    const orientations = orientationsForPlacement(g, tile.shape, p.nr, p.nc, p.dir);
    let rotation = payload.rotation;
    if (!orientations.some(o => o.rotation === rotation)) {
        rotation = orientations.length ? orientations[0].rotation : 0;
    }
    Tiles.applyOrientation(tile, p.dir, rotation);
    tile.row = p.nr;
    tile.col = p.nc;
    g.board[Utils.cellKey(p.nr, p.nc)] = tile;

    // Mirror a fireball breach from a neighbour that was blasted while this cell
    // was still empty: if a neighbour opens a breach toward us, show the breach
    // on our facing edge too, so the blasted passage reads on both tiles. (The
    // new tile is always drawn with a native exit back to its discovery source,
    // so we must NOT skip when we already have an exit there — the breach
    // overlay is what marks the passage as fireball-made.)
    for (let nd = 0; nd < 4; nd++) {
        const dd = Tiles.DELTA[nd];
        const nb = tileAt(g, p.nr + dd.row, p.nc + dd.col);
        if (!nb || !nb.breaches) continue;
        if (nb.breaches.includes(Tiles.opposite(nd))) {
            tile.breaches = tile.breaches || [];
            if (!tile.breaches.includes(nd)) tile.breaches.push(nd);
        }
    }

    // A toxic cloud is still hanging in the air: a Nauséabonde tile revealed now
    // is contaminated on the spot, which is exactly what makes Explorer risky
    // during a Poison event.
    if (g.poisonActive && tile.kind === 'poisonable') {
        tile.state = 'poisoned';
        g.poisonedCells.push(Utils.cellKey(p.nr, p.nc));
    }

    if (source === 'reserve') g.reserveTile = newReserve;

    spendAp(g, p.cost);
    const mode = p.mode;
    g.pending = null;

    if (mode === 'explore') {
        pushLog(room, '🧭 ' + char.name + ' explore et entre sur une tuile (' + tileLabel(tile) + ').');
        enterTile(room, char, tile, { elf: char.flags.elvenAgility });
    } else {
        pushLog(room, '🧱 ' + char.name + ' découvre une tuile (' + tileLabel(tile) + ').');
    }
    checkGameEnd(room);
    return { ok: true };
}

/** Cancel a pending placement : put the drawn tile back on top of the deck. */
function cancelPlacement(room, char) {
    const g = room.game;
    const p = g.pending;
    if (!p || p.charId !== char.id) return { ok: false, error: 'no-pending' };
    g.deck.unshift(p.deckTile);
    g.pending = null;
    return { ok: true };
}

/** Gnome's "Strategic retreat" : discard the pending drawn tile, draw the next. */
function rerollPlacement(room, char) {
    const g = room.game;
    const p = g.pending;
    if (!p || p.charId !== char.id) return { ok: false, error: 'no-pending' };
    if (!char.flags.mulligan) return { ok: false, error: 'no-ability' };
    if (char.uses.mulligan >= MULLIGAN_USES) return { ok: false, error: 'no-mulligan-left' };
    if (!g.deck.length) return { ok: false, error: 'empty-deck' };
    char.uses.mulligan++;
    p.deckTile = g.deck.shift(); // previous drawn tile is discarded
    pushLog(room, '🔄 ' + char.name + ' utilise Repli stratégique (' + char.uses.mulligan + '/' + MULLIGAN_USES + ').');
    return { ok: true };
}

function tileLabel(tile) {
    const labels = {
        simple: 'simple', bridge: 'pont suspendu', 'door-front': 'porte verrouillée',
        'door-back': 'porte verrouillée', trap: 'plaque piégée', flammable: 'inflammable',
        poisonable: 'nauséabonde', gloom: 'pénombre', 'dragon-lair': 'antre de dragon', exit: 'SORTIE'
    };
    return labels[tile.kind] || tile.kind;
}

// ---------------------------------------------------------------------------
// Other base / dungeon actions
// ---------------------------------------------------------------------------

// Grant free moves (Run / Animal Celerity) and remember the spent AP so the
// player can cancel it as long as no movement has started yet.
function grantFreeMoves(g, kind, apCost, moves) {
    g.freeMoves += moves;
    if (g.freeMoveGrant) {
        g.freeMoveGrant.ap += apCost;
        g.freeMoveGrant.moves += moves;
    } else {
        g.freeMoveGrant = { kind, ap: apCost, moves };
    }
}

function doRun(room, char, payload) {
    const g = room.game;
    if (g.ap < 2) return { ok: false, error: 'no-ap' };
    spendAp(g, 2);
    grantFreeMoves(g, 'run', 2, 3);
    pushLog(room, '🏃 ' + char.name + ' court (3 déplacements).');
    return { ok: true };
}

// Refund a not-yet-started Run / Animal Celerity.
function doCancelRun(room, char, payload) {
    const g = room.game;
    const grant = g.freeMoveGrant;
    if (!grant) return { ok: false, error: 'nothing-to-cancel' };
    g.ap += grant.ap;
    g.freeMoves = Math.max(0, g.freeMoves - grant.moves);
    g.freeMoveGrant = null;
    pushLog(room, '↩️ ' + char.name + ' annule ' + (grant.kind === 'run' ? 'sa course' : 'sa célérité animale') + '.');
    return { ok: true };
}

function doHeal(room, char, payload) {
    const g = room.game;
    if (g.ap < 2) return { ok: false, error: 'no-ap' };
    const targetId = payload.targetId || char.id;
    const target = getChar(g, targetId);
    if (!target || target.dead) return { ok: false, error: 'bad-target' };
    if (target.row !== char.row || target.col !== char.col) return { ok: false, error: 'not-same-tile' };
    if (target.hp >= target.maxHp && target.conscious) return { ok: false, error: 'full-hp' };
    spendAp(g, 2);
    healChar(room, target, 1);
    pushLog(room, '➕ ' + char.name + ' soigne ' + (target.id === char.id ? 'lui-même' : target.name) + ' (+1 PV).');
    return { ok: true };
}

function doWalkDark(room, char, payload) {
    return doMove(room, char, payload, { anyTile: true, cost: 2, forceAp: true, requireKind: 'dark' });
}

function doWalkBridge(room, char, payload) {
    const g = room.game;
    const dir = payload.dir;
    const here = tileAt(g, char.row, char.col);
    if (!Utils.edgeConnected(g.board, here, dir)) return { ok: false, error: 'no-connection' };
    const d = Tiles.DELTA[dir];
    const target = tileAt(g, char.row + d.row, char.col + d.col);
    if (!target || target.kind !== 'bridge') return { ok: false, error: 'not-a-bridge' };
    const cost = char.flags.elvenAgility ? 1 : 2;
    if (g.ap < cost) return { ok: false, error: 'no-ap' };
    spendAp(g, cost);
    enterTile(room, char, target, { elf: char.flags.elvenAgility });
    pushLog(room, '🌉 ' + char.name + ' marche en équilibre sur un pont suspendu.');
    return { ok: true };
}

function doExtinguish(room, char, payload, forcedCost) {
    const g = room.game;
    // The Dwarf's "Maîtrise des flammes" is a discount on the action itself, so
    // it must apply to the base action too, not only to the ability button.
    const cost = forcedCost !== undefined ? forcedCost : (char.flags.extinguishCheap ? 1 : 2);
    // Target tile : same tile or adjacent, must be on fire.
    const target = findTargetTile(g, char, payload);
    if (!target) return { ok: false, error: 'no-target' };
    if (target.state !== 'fire') return { ok: false, error: 'not-on-fire' };
    if (!isSameOrAdjacent(g, char, target)) return { ok: false, error: 'too-far' };
    if (g.ap < cost) return { ok: false, error: 'no-ap' };
    spendAp(g, cost);
    target.state = 'normal';
    pushLog(room, '🧯 ' + char.name + ' éteint un incendie.');
    return { ok: true };
}

function doPickLock(room, char, payload) {
    const g = room.game;
    // Per the rules, a door is always picked from the tile you stand on (whatever
    // its direction). You first move onto the locked door tile, then pick it.
    const doorTile = tileAt(g, char.row, char.col);
    if (!doorTile || !doorTile.doorLocked) return { ok: false, error: 'no-door' };
    if (g.lockpickKits <= 0) return { ok: false, error: 'no-kits' };

    const cost = char.flags.lockpickCheap ? 1 : 2;
    if (g.ap < cost) return { ok: false, error: 'no-ap' };
    spendAp(g, cost);

    // The Rogue unlocks automatically; others need a talent roll.
    // The kit is consumed only on success.
    if (char.flags.lockpickCheap) {
        doorTile.doorLocked = false;
        g.lockpickKits--;
        pushLog(room, '🗝️ ' + char.name + ' crochète une porte (kits restants : ' + g.lockpickKits + ').');
        return { ok: true };
    }
    const roll = talent(char);
    if (roll.success) {
        doorTile.doorLocked = false;
        g.lockpickKits--;
        pushLog(room, '🗝️ ' + char.name + ' crochète une porte (dé ' + roll.value + ', kits : ' + g.lockpickKits + ').');
    } else {
        pushLog(room, '🔒 ' + char.name + ' échoue au crochetage (dé ' + roll.value + ', aucun kit consommé).');
    }
    return { ok: true };
}

/**
 * Step 2 of "Marche de l'Ombre" : reappear on ANY revealed Pénombre tile, dark
 * or not. This is the whole turn — it costs no action point, and ends it.
 */
function doShadowReturn(room, char, payload) {
    const g = room.game;
    if (!char.shadowOut) return { ok: false, error: 'not-in-shadow' };
    const dest = payload.destCell ? g.board[payload.destCell] : null;
    if (!isShadowTile(dest)) return { ok: false, error: 'bad-destination' };
    char.shadowOut = false;
    g.ap = 0;
    enterTile(room, char, dest);
    pushLog(room, '🌒 ' + char.name + ' resurgit de l\'ombre.');
    pushFx(room, { kind: 'shadow-in', charId: char.id, name: char.name });
    if (!checkGameEnd(room)) endTurn(room);
    return { ok: true };
}

function doHide(room, char, payload) {
    const g = room.game;
    if (g.ap < 2) return { ok: false, error: 'no-ap' };
    spendAp(g, 2);
    // The automatic success is for the third CONSECUTIVE round of hiding : the
    // streak restarts as soon as a round goes by without hiding.
    char.hideStreak = (char.hideRound === g.round - 1 || char.hideRound === g.round)
        ? (char.hideStreak || 0) + 1 : 1;
    char.hideRound = g.round;
    const auto = char.hideStreak >= 3;
    const roll = talent(char);
    const success = auto || roll.success;
    if (success) {
        char.hidden = true;
        pushLog(room, '🙈 ' + char.name + ' se cache' + (auto ? ' (réussite automatique).' : ' (dé ' + roll.value + ').'));
    } else {
        pushLog(room, '👀 ' + char.name + ' échoue à se cacher (dé ' + roll.value + ').');
    }
    pushFx(room, { kind: 'hide', charId: char.id, name: char.name, success, auto, roll: roll.value });
    return { ok: true };
}

// --- Character abilities -------------------------------------------------

function doAbility(room, char, payload) {
    const abilityId = payload.abilityId;
    switch (abilityId) {
        case 'flame-mastery':
            if (!char.flags.extinguishCheap) return { ok: false, error: 'no-ability' };
            return doExtinguish(room, char, payload, 1);
        case 'apply-balm': {
            const g = room.game;
            if (!char.flags.balmHeal) return { ok: false, error: 'no-ability' };
            if (g.ap < 1) return { ok: false, error: 'no-ap' };
            const target = getChar(g, payload.targetId);
            if (!target || target.id === char.id || target.dead) return { ok: false, error: 'bad-target' };
            if (target.row !== char.row || target.col !== char.col) return { ok: false, error: 'not-same-tile' };
            spendAp(g, 1);
            healChar(room, target, 1);
            pushLog(room, '🌿 ' + char.name + ' applique un beaume sur ' + target.name + ' (+1 PV).');
            return { ok: true };
        }
        case 'animal-celerity': {
            const g = room.game;
            if (!char.flags.animalCelerity) return { ok: false, error: 'no-ability' };
            if (g.ap < 1) return { ok: false, error: 'no-ap' };
            spendAp(g, 1);
            grantFreeMoves(g, 'animal-celerity', 1, 2);
            pushLog(room, '🐾 ' + char.name + ' utilise Célérité animale (2 déplacements).');
            return { ok: true };
        }
        case 'lockpicking':
            if (!char.flags.lockpickCheap) return { ok: false, error: 'no-ability' };
            return doPickLock(room, char, payload);
        case 'slay-dragon': {
            const g = room.game;
            if (!char.flags.slayDragon) return { ok: false, error: 'no-ability' };
            if (g.ap < 1) return { ok: false, error: 'no-ap' };
            const dragon = g.dragons.find(dr => isCellAdjacent(char.row, char.col, dr.row, dr.col));
            if (!dragon) return { ok: false, error: 'no-adjacent-dragon' };
            spendAp(g, 1);
            g.dragons = g.dragons.filter(dr => dr.id !== dragon.id);
            pushLog(room, '⚔️ ' + char.name + ' terrasse un Dragon adjacent !');
            pushFx(room, { kind: 'dragon-slain', row: dragon.row, col: dragon.col, by: char.name });
            return { ok: true };
        }
        case 'inspiration': {
            const g = room.game;
            if (!char.flags.inspiration) return { ok: false, error: 'no-ability' };
            if (g.ap < 1) return { ok: false, error: 'no-ap' };
            // "Ce pouvoir ne peut être utilisé qu'une fois par tour." Each
            // adventurer acts once per round, so per-round == per-turn, and it
            // survives the interrupt stack unlike a game-level flag.
            if (char.inspireRound === g.round) return { ok: false, error: 'inspiration-used' };
            const target = getChar(g, payload.targetId);
            if (!target || target.id === char.id || target.dead || !target.conscious || target.shadowOut) return { ok: false, error: 'bad-target' };
            spendAp(g, 1);
            char.inspireRound = g.round;
            // The inspired adventurer plays immediately with 1 bonus action point.
            g.interruptStack.push({ activeId: g.activeId, ap: g.ap, freeMoves: g.freeMoves, freeMoveGrant: g.freeMoveGrant, effortUsed: g.effortUsed });
            g.activeId = target.id;
            g.ap = 1;
            g.freeMoves = 0;
            g.freeMoveGrant = null;
            g.effortUsed = false;
            pushLog(room, '🎵 ' + char.name + ' inspire ' + target.name + ' : il joue immédiatement (+1 PA) !');
            return { ok: true };
        }
        case 'fireball': {
            const g = room.game;
            if (!char.flags.fireball) return { ok: false, error: 'no-ability' };
            if (char.uses.fireball >= FIREBALL_USES) return { ok: false, error: 'no-fireball-left' };
            if (g.ap < 2) return { ok: false, error: 'no-ap' };
            const dir = payload.dir;
            if (dir === undefined) return { ok: false, error: 'no-direction' };
            const here = tileAt(g, char.row, char.col);
            const d = Tiles.DELTA[dir];
            const neighbour = tileAt(g, char.row + d.row, char.col + d.col);
            // What matters is whether a passage ALREADY EXISTS, not whether our
            // own tile happens to have a corridor there: a corridor that dies on
            // the neighbour's wall is exactly what the explosive is for. Only
            // refuse when the two tiles are genuinely already connected.
            const opensOut = Utils.tileOpensToward(here, dir);
            const doorBlocks = !!(here.doorLocked && here.doorDir === dir);
            if (!neighbour) {
                // Empty cell : only worth blasting if a wall actually stands there.
                if (opensOut) return { ok: false, error: 'already-open' };
            } else if (opensOut && Utils.tileOpensToward(neighbour, Tiles.opposite(dir)) && !doorBlocks) {
                return { ok: false, error: 'already-connected' };
            }
            spendAp(g, 2);
            char.uses.fireball++;
            // Blast a wall : record a "breach" opening in that direction (and on the
            // neighbour if any). Breaches are kept SEPARATE from `exits` so the tile
            // art never rotates; the client draws a breach overlay on top instead.
            if (!here.exits.includes(dir)) {
                here.breaches = here.breaches || [];
                if (!here.breaches.includes(dir)) here.breaches.push(dir);
            }
            // Blowing up a wall only frees THAT edge — a locked door on another
            // side of the tile stays locked.
            if (here.doorDir === dir) here.doorLocked = false;
            if (neighbour) {
                const back = Tiles.opposite(dir);
                if (!neighbour.exits.includes(back)) {
                    neighbour.breaches = neighbour.breaches || [];
                    if (!neighbour.breaches.includes(back)) neighbour.breaches.push(back);
                }
            }
            pushLog(room, '💥 ' + char.name + ' lance une Boule de feu et perce une paroi (' + char.uses.fireball + '/' + FIREBALL_USES + ') !');
            // The blast resolves an Incendie IMMEDIATELY, on the spot. It must NOT
            // draw from the misfortune pile: the rulebook says "Résolvez
            // immédiatement un événement Éboulement", it never spends a Danger
            // card, so the doom clock is untouched.
            resolveFire(room);
            checkGameEnd(room);
            return { ok: true };
        }
        case 'shadow-walk': {
            // Step 1 of two. The rulebook removes the figure from the board and
            // parks it on the character sheet; the reappearance is the WHOLE of
            // the next turn. So this never teleports on the spot.
            const g = room.game;
            if (!char.flags.shadowWalk) return { ok: false, error: 'no-ability' };
            if (char.shadowOut) return { ok: false, error: 'already-in-shadow' };
            if (g.ap < 2) return { ok: false, error: 'no-ap' };
            const here = tileAt(g, char.row, char.col);
            if (!isShadowTile(here)) return { ok: false, error: 'not-on-shadow' };
            spendAp(g, 2);
            char.shadowOut = true;
            char.hidden = false;         // off the board entirely, no need to hide
            pushLog(room, '🌑 ' + char.name + ' se fond dans l\'ombre et disparaît du Donjon.');
            pushFx(room, { kind: 'shadow-out', charId: char.id, name: char.name });
            endTurn(room);               // nothing else can be done while gone
            return { ok: true };
        }
        default:
            return { ok: false, error: 'unknown-ability' };
    }
}

// --- target / adjacency helpers ---

function isCellAdjacent(r1, c1, r2, c2) {
    return (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
}

function isSameOrAdjacent(g, char, tile) {
    if (tile.row === char.row && tile.col === char.col) return true;
    return isCellAdjacent(char.row, char.col, tile.row, tile.col);
}

function findTargetTile(g, char, payload) {
    if (payload.cell) return g.board[payload.cell] || null;
    if (payload.dir !== undefined) {
        const d = Tiles.DELTA[payload.dir];
        return tileAt(g, char.row + d.row, char.col + d.col);
    }
    return tileAt(g, char.row, char.col);
}

const ACTIONS = {
    discover: beginPlacement('discover'),
    explore: beginPlacement('explore'),
    move: (room, c, p) => doMove(room, c, p, { elf: c.flags.elvenAgility }),
    run: doRun,
    'cancel-run': doCancelRun,
    heal: doHeal,
    'walk-dark': doWalkDark,
    'walk-bridge': doWalkBridge,
    extinguish: doExtinguish,
    'pick-lock': doPickLock,
    hide: doHide,
    'shadow-return': doShadowReturn,
    ability: doAbility
};

// ---------------------------------------------------------------------------
// Dragon phase
// ---------------------------------------------------------------------------

function dragonTargets(g) {
    return g.characters.filter(c =>
        c.conscious && !c.escaped && !c.dead && !c.hidden && !c.shadowOut &&
        !c.flags.dragonImmune);
}

function nearestTarget(g, dragon) {
    const dist = Utils.bfsDistances(g.board, dragon.row, dragon.col, DRAGON_PATH);
    let best = null, bestDist = Infinity;
    for (const c of dragonTargets(g)) {
        const dd = dist[Utils.cellKey(c.row, c.col)];
        if (dd === undefined) continue;
        if (dd < bestDist || (dd === bestDist && best && c.level < best.level)) {
            bestDist = dd; best = c;
        }
    }
    return { target: best, distance: bestDist };
}

function knockOutCharsOnCell(room, row, col) {
    const g = room.game;
    for (const c of charsOnCell(g, row, col)) {
        if (c.flags.dragonImmune) continue; // Gnome stealth
        if (c.conscious) {
            c.hp = 0;
            c.conscious = false;
            c.hidden = false;
            pushLog(room, '🐉 ' + c.name + ' est terrassé par un Dragon !');
        }
    }
}

function moveOneDragon(room, dragon) {
    const g = room.game;
    const { target, distance } = nearestTarget(g, dragon);
    if (!target || distance > DRAGON_RANGE) {
        // No targetable victim — whether because it is out of range or simply
        // hidden — so the dragon vanishes (it may come back later). A dragon
        // either has a victim and advances, or disappears; it never lingers.
        dragon.remove = true;
        pushLog(room, '🐉 Un Dragon ne trouve plus de proie et disparaît.');
        return;
    }
    const dir = Utils.firstStepToward(g.board, dragon.row, dragon.col, target.row, target.col, DRAGON_PATH);
    if (dir === null) {
        // The only way a targetable adventurer is at distance 0 is that we are
        // already sharing its tile (e.g. it walked onto the dragon). A dragon
        // never lingers idle next to a conscious victim — it terrasses it here.
        knockOutCharsOnCell(room, dragon.row, dragon.col);
        return;
    }
    const d = Tiles.DELTA[dir];
    dragon.row += d.row;
    dragon.col += d.col;
    knockOutCharsOnCell(room, dragon.row, dragon.col);
}

function runDragonPhase(room, times = 1, reason = 'phase') {
    const g = room.game;
    g.phase = PHASE.DRAGON;
    if (g.dragons.length > 0) {
        pushLog(room, reason === 'event'
            ? '🐉 Événement Dragon : les dragons se déplacent' + (times > 1 ? ' ' + times + ' fois' : '') + '.'
            : '🐉 Phase Dragon : les dragons se déplacent.');
    }
    for (let t = 0; t < times; t++) {
        for (const dragon of g.dragons) moveOneDragon(room, dragon);
        g.dragons = g.dragons.filter(dr => !dr.remove);
    }
    // NOTE: hidden adventurers stay hidden here — the flag is cleared at the
    // start of the next round (see startRound), so hiding also covers the bad
    // event phase that follows this one.
}

function spawnDragon(room) {
    const g = room.game;
    if (g.dragons.length >= MAX_DRAGONS) return;
    // A lair is chosen by its distance to a potential VICTIM, so an adventurer
    // who is off the board (in the shadows) attracts nothing.
    const conscious = consciousInDungeon(g).filter(c => !c.shadowOut);
    if (conscious.length === 0) return;

    // Find the dragon-lair tile (no dragon yet) closest to a conscious adventurer.
    let bestLair = null, bestDist = Infinity;
    for (const key of Object.keys(g.board)) {
        const tile = g.board[key];
        if (tile.kind !== 'dragon-lair') continue;
        if (g.dragons.some(dr => dr.row === tile.row && dr.col === tile.col)) continue;
        const dist = Utils.bfsDistances(g.board, tile.row, tile.col, DRAGON_PATH);
        for (const c of conscious) {
            const dd = dist[Utils.cellKey(c.row, c.col)];
            if (dd !== undefined && dd < bestDist) { bestDist = dd; bestLair = tile; }
        }
    }
    if (bestLair && bestDist <= DRAGON_RANGE) {
        g.dragons.push({ id: g.dragonSeq++, row: bestLair.row, col: bestLair.col });
        pushLog(room, '🐲 Un Dragon surgit d\'un antre !');
        knockOutCharsOnCell(room, bestLair.row, bestLair.col);
    }
}

// ---------------------------------------------------------------------------
// Event phase
// ---------------------------------------------------------------------------

function runEventPhase(room) {
    const g = room.game;
    g.phase = PHASE.EVENT;

    // Clear last turn's poisoned tiles (poison lasts until the next event phase).
    for (const key of g.poisonedCells) {
        const tile = g.board[key];
        if (tile && tile.state === 'poisoned') tile.state = 'normal';
    }
    g.poisonedCells = [];
    g.poisonActive = false;

    if (g.eventDeck.length === 0) {
        g.suddenDeath = true;
        resolveSuddenDeath(room);
        return;
    }

    const card = g.eventDeck.shift();
    g.eventsResolved++;
    resolveEvent(room, card);
}

function resolveEvent(room, card) {
    const g = room.game;
    g.currentEvent = { type: card.type, label: card.label, doubled: card.doubled };
    pushLog(room, '🎴 Événement fâcheux : ' + card.label);

    if (card.type === 'dragon') {
        if (card.doubled) {
            runDragonPhase(room, 2, 'event');  // existing dragons move twice
            spawnDragon(room);
            spawnDragon(room);                 // up to 2 new dragons
        } else {
            runDragonPhase(room, 1, 'event');
            spawnDragon(room);
        }
        return;
    }

    const repeat = card.doubled ? 2 : 1;
    for (let i = 0; i < repeat; i++) {
        switch (card.type) {
            case 'curse': resolveCurse(room); break;
            case 'gloom': resolveGloom(room); break;
            case 'poison': resolvePoison(room); break;
            case 'fire': resolveFire(room); break;
        }
    }
}

function resolveCurse(room) {
    const g = room.game;
    for (const c of g.characters) {
        if (!c.conscious || c.escaped || c.dead) continue;
        if (paladinProtects(g, c.row, c.col, c.id)) continue;
        const roll = talent(c);
        if (!roll.success) {
            pushLog(room, '🌀 Malédiction : ' + c.name + ' échoue (dé ' + roll.value + ') et perd 1 PV.');
            applyDamage(room, c, 1);
        }
    }
}

function resolveGloom(room) {
    const g = room.game;
    let affected = 0;
    // Step 1 : every Pénombre tile not already dark becomes Obscurité totale.
    for (const key of Object.keys(g.board)) {
        const tile = g.board[key];
        if (tile.kind === 'gloom' && tile.state !== 'dark') {
            tile.state = 'dark';
            affected++;
        }
    }
    // Step 2 : THEN every adventurer standing on a dark tile loses 1 HP — the
    // rulebook damages everyone in the dark, not only those on freshly
    // darkened tiles.
    for (const key of Object.keys(g.board)) {
        const tile = g.board[key];
        if (tile.state !== 'dark') continue;
        for (const c of charsOnCell(g, tile.row, tile.col)) {
            if (c.flags.nightVision) continue;
            if (paladinProtects(g, c.row, c.col, c.id)) continue;
            applyDamage(room, c, 1);
            pushLog(room, '🌑 ' + c.name + ' est surpris par l\'obscurité et perd 1 PV.');
        }
    }
    if (affected === 0) pushLog(room, '🌑 Obscurité totale : aucune nouvelle tuile pénombre découverte.');
}

function resolvePoison(room) {
    const g = room.game;
    const poisoned = [];
    for (const key of Object.keys(g.board)) {
        const tile = g.board[key];
        if (tile.kind === 'poisonable') {
            tile.state = 'poisoned';
            poisoned.push(key);
            for (const c of charsOnCell(g, tile.row, tile.col)) {
                if (paladinProtects(g, c.row, c.col, c.id)) continue;
                applyDamage(room, c, 2);
                pushLog(room, '☠️ ' + c.name + ' est empoisonné et perd 2 PV.');
            }
        }
    }
    g.poisonedCells = poisoned;
    // The cloud stays until the next event phase and also contaminates tiles
    // revealed in the meantime — which is what makes Explorer risky here.
    g.poisonActive = true;
    if (poisoned.length === 0) pushLog(room, '☠️ Poison : aucune tuile nauséabonde découverte.');
}

function resolveFire(room) {
    const g = room.game;
    const die = Utils.rollDie();
    pushLog(room, '🎲 Incendie : le dé indique ' + die + '.');
    let burned = 0;
    for (const key of Object.keys(g.board)) {
        const tile = g.board[key];
        if (tile.kind === 'flammable' && tile.fireValues && tile.fireValues.includes(die) && tile.state !== 'fire') {
            tile.state = 'fire';
            burned++;
            for (const c of charsOnCell(g, tile.row, tile.col)) {
                if (paladinProtects(g, c.row, c.col, c.id)) continue;
                const dmg = c.flags.fireResist ? 1 : 3;
                applyDamage(room, c, dmg);
                pushLog(room, '🔥 ' + c.name + ' est pris dans l\'incendie et perd ' + dmg + ' PV.');
            }
        }
    }
    if (burned === 0) pushLog(room, '🔥 Aucune tuile inflammable ne correspond au dé.');
}

function resolveSuddenDeath(room) {
    const g = room.game;
    g.currentEvent = { type: 'sudden-death', label: 'Mort subite', doubled: false };
    pushLog(room, '💀 MORT SUBITE : les ténèbres envahissent le Donjon !');
    const killed = [], survived = [];
    for (const c of g.characters) {
        if (c.escaped || c.dead) continue;
        const tile = tileAt(g, c.row, c.col);
        if (tile && tile.kind === 'exit') continue;
        const roll = talent(c);
        if (!roll.success) {
            c.dead = true;
            c.conscious = false;
            c.hp = 0;
            killed.push(c.name + ' (dé ' + roll.value + ')');
            pushLog(room, '💀 ' + c.name + ' est dévoré par les ténèbres (dé ' + roll.value + ').');
        } else {
            survived.push(c.name + ' (dé ' + roll.value + ')');
            pushLog(room, '🕯️ ' + c.name + ' résiste aux ténèbres (dé ' + roll.value + ').');
        }
    }
    pushFx(room, { kind: 'sudden-death', killed, survived });
}

// ---------------------------------------------------------------------------
// End-of-game evaluation
// ---------------------------------------------------------------------------

function checkGameEnd(room) {
    const g = room.game;
    if (g.status !== GAME_STATUS.PLAYING) return true;

    const escaped = g.characters.filter(c => c.escaped).length;
    const dead = g.characters.filter(c => c.dead).length;
    const consciousLeft = consciousInDungeon(g).length;
    const total = g.characters.length;

    // Game continues as long as a conscious adventurer remains in the dungeon.
    if (consciousLeft > 0) return false;

    // Nobody conscious left in the dungeon itself — but adventurers standing on
    // the Exit are still in play and may walk back in to wake a fallen friend.
    // The run only stops once there is nothing left to attempt.
    const downedInDungeon = g.characters.filter(c => !c.dead && !c.escaped && !c.conscious).length;
    const rescuers = g.characters.filter(c => c.escaped && c.conscious).length;
    if (downedInDungeon > 0 && rescuers > 0) {
        if (!g.rescueNotice) {
            g.rescueNotice = true;
            pushLog(room, '🚨 Plus personne de conscient dans le Donjon. Les aventuriers sur la SORTIE ' +
                'peuvent y retourner pour réveiller les autres — ou attendre la mort subite.');
        }
        return false;
    }

    // No conscious adventurer left to act : resolve the outcome.
    const abandoned = total - escaped; // unconscious + dead left in the dungeon
    g.endStats = {
        escaped, abandoned, dead, total, turns: g.round,
        durationMs: g.startedAt ? Math.max(0, Date.now() - g.startedAt) : null
    };

    if (escaped === 0) {
        g.status = GAME_STATUS.LOST;
        pushLog(room, '☠️ Tous les aventuriers ont échoué. Partie perdue.');
    } else if (abandoned >= 3) {
        g.status = GAME_STATUS.LOST;
        pushLog(room, '☠️ Trop d\'aventuriers abandonnés (' + abandoned + '). Partie perdue.');
    } else {
        g.status = GAME_STATUS.WON;
        g.rank = abandoned === 0 ? 'gold' : abandoned === 1 ? 'silver' : 'bronze';
        pushLog(room, '🏆 Victoire ! Rang ' + rankLabel(g.rank) + ' (' + abandoned + ' abandonné(s)).');
    }
    g.phase = PHASE.END;
    return true;
}

function rankLabel(rank) {
    return rank === 'gold' ? 'Or' : rank === 'silver' ? 'Argent' : 'Bronze';
}

// ---------------------------------------------------------------------------
// Client-facing serialisable state
// ---------------------------------------------------------------------------

function tileDescriptor(g, tile, p) {
    return {
        uid: tile.uid,
        kind: tile.kind,
        shape: tile.shape,
        fireValues: tile.fireValues || null,
        orientations: orientationsForPlacement(g, tile.shape, p.nr, p.nc, p.dir)
    };
}

function serializePending(g) {
    const p = g.pending;
    if (!p) return null;
    const char = getChar(g, p.charId);
    const candidates = [{ source: 'deck', ...tileDescriptor(g, p.deckTile, p) }];
    if (p.reserveOffered && g.reserveTile) {
        candidates.push({ source: 'reserve', ...tileDescriptor(g, g.reserveTile, p) });
    }
    return {
        mode: p.mode,
        dir: p.dir,
        ownerId: char ? char.ownerId : null,
        charName: char ? char.name : '',
        candidates,
        canReroll: !!(char && char.flags.mulligan && char.uses.mulligan < MULLIGAN_USES && g.deck.length > 0),
        mulliganLeft: char && char.flags.mulligan ? (MULLIGAN_USES - char.uses.mulligan) : 0
    };
}

function buildState(room) {
    const g = room.game;
    if (!g) return null;
    const active = getChar(g, g.activeId);
    return {
        status: g.status,
        difficulty: g.difficulty,
        round: g.round,
        phase: g.phase,
        board: g.board,
        characters: g.characters.map(c => ({
            id: c.id, name: c.name, emoji: c.emoji, color: c.color, level: c.level,
            hp: c.hp, maxHp: c.maxHp, row: c.row, col: c.col,
            conscious: c.conscious, escaped: c.escaped, dead: c.dead, hidden: c.hidden,
            shadowOut: !!c.shadowOut,
            ownerId: c.ownerId,
            abilities: c.abilities,
            uses: c.uses
        })),
        dragons: g.dragons,
        activeId: g.activeId,
        activeOwnerId: active ? active.ownerId : null,
        ap: g.ap,
        freeMoves: g.freeMoves,
        cancelRunKind: g.freeMoveGrant ? g.freeMoveGrant.kind : null,
        effortUsed: g.effortUsed,
        order: g.order,
        firstIndex: g.firstIndex,
        eventsTotal: g.eventsTotal,
        eventsResolved: g.eventsResolved,
        turnsLeft: Math.max(0, g.eventsTotal - g.eventsResolved),
        turnTotal: g.roundStartCount || g.queue.length,
        turnRemaining: g.queue.length,
        suddenDeath: g.suddenDeath,
        currentEvent: g.currentEvent,
        lockpickKits: g.lockpickKits,
        deckLeft: g.deck.length,
        reserveTile: g.reserveTile ? { kind: g.reserveTile.kind, shape: g.reserveTile.shape } : null,
        pending: serializePending(g),
        interrupt: g.interruptStack.length > 0,
        rank: g.rank || null,
        endStats: g.endStats || null,
        fx: g.fx,
        log: g.log
    };
}

module.exports = {
    GAME_STATUS,
    initLobbyData,
    getCharacterCatalog,
    addSelection,
    removeSelection,
    setDifficulty,
    getCanStartGame,
    canControlMultiple,
    initGame,
    applyAction,
    buildState
};
