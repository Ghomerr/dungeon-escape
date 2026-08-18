'use strict';
/**
 * Heuristic bot driving one adventurer's turn through the real game engine.
 *
 * It only ever emits actions that the engine itself accepts (same payloads as
 * the web client), so a simulated game is a genuine game.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const Utils = require(path.join(ROOT, 'server', 'utils.js'));
const Tiles = require(path.join(ROOT, 'server', 'tiles.js'));
const Game = require(path.join(ROOT, 'server', 'game.js'));

const KEY = Utils.cellKey;

// ---------------------------------------------------------------------------
// Board helpers (bot side — mirrors the engine's own movement rules)
// ---------------------------------------------------------------------------

/**
 * AP cost for `char` to step onto `tile`, or null when impossible.
 * Hazards are priced in AP-equivalent: 1 HP costs 2 AP to heal back, so an
 * expected loss of X HP is worth 2X AP of detour.
 */
function entryCost(char, tile) {
    if (!tile) return null;
    if (tile.kind === 'exit') return 1;
    let cost;
    if (tile.state === 'fire') cost = char.flags.elvenAgility ? 1 : 3; // 2 to extinguish + 1 to move
    else if (tile.state === 'dark') cost = char.flags.nightVision ? 1 : 2;  // "Marcher dans l'Obscurité"
    else if (tile.kind === 'bridge') cost = char.flags.elvenAgility ? 1 : 2; // "Marcher en équilibre"
    else cost = 1;
    // An active poison cloud costs 2 HP on entry — worth a 4 AP detour.
    if (tile.state === 'poisoned') cost += 4;
    // A trapped plate is a 50% chance of losing 1 HP.
    if (tile.kind === 'trap') cost += 1;
    // A Potion is worth 2 AP (the price of healing that point by hand), but
    // only to somebody who can actually drink it.
    if (tile.item === 'potion' && char.hp < char.maxHp) cost -= 1.5;
    else if (tile.item === 'scroll') cost -= 1;
    return Math.max(0.1, cost);
}

/** The engine action that performs that step. */
function stepAction(char, tile) {
    if (tile.state === 'fire' && !char.flags.elvenAgility) return 'extinguish';
    if (tile.state === 'dark' && !char.flags.nightVision) return 'walk-dark';
    if (tile.kind === 'bridge' && !char.flags.elvenAgility) return 'walk-bridge';
    return 'move';
}

/**
 * Dijkstra over AP cost from the character's cell.
 * opts.openDoors : locked doors are crossable at an extra cost (pick-lock).
 */
function planPaths(g, char, opts = {}) {
    const startKey = KEY(char.row, char.col);
    const dist = { [startKey]: 0 };
    const prev = {};
    const dragonCells = new Set(g.dragons.map(d => KEY(d.row, d.col)));
    const queue = [[0, startKey]];

    while (queue.length) {
        let bi = 0;
        for (let i = 1; i < queue.length; i++) if (queue[i][0] < queue[bi][0]) bi = i;
        const [d0, key] = queue.splice(bi, 1)[0];
        if (d0 > dist[key]) continue;
        const tile = g.board[key];
        if (!tile) continue;
        for (let dir = 0; dir < 4; dir++) {
            if (!Utils.tileOpensToward(tile, dir)) continue;
            const d = Tiles.DELTA[dir];
            const nKey = KEY(tile.row + d.row, tile.col + d.col);
            const nb = g.board[nKey];
            if (!nb) continue;
            if (!Utils.tileOpensToward(nb, Tiles.opposite(dir))) continue;
            const locked = !!(tile.doorLocked && tile.doorDir === dir);
            if (locked && !opts.openDoors) continue;
            let w = entryCost(char, nb);
            if (w === null) continue;
            if (locked) w += char.flags.lockpickCheap ? 1 : 3; // pick-lock (+ possible retries)
            if (!char.flags.dragonImmune && dragonCells.has(nKey)) w += 40;
            const nd = d0 + w;
            if (dist[nKey] === undefined || nd < dist[nKey] - 1e-9) {
                dist[nKey] = nd;
                prev[nKey] = { key, dir, tile: nb, locked };
                queue.push([nd, nKey]);
            }
        }
    }
    return { dist, prev };
}

function reconstruct(prev, startKey, targetKey) {
    const steps = [];
    let k = targetKey;
    let guard = 0;
    while (k !== startKey && guard++ < 500) {
        const p = prev[k];
        if (!p) return null;
        steps.unshift({ dir: p.dir, tile: p.tile, locked: p.locked, fromKey: p.key });
        k = p.key;
    }
    return k === startKey ? steps : null;
}

/** Directions from `tile` that lead to an empty cell (exploration frontier). */
function freeDirs(g, tile) {
    const out = [];
    for (let dir = 0; dir < 4; dir++) {
        if (!Utils.tileOpensToward(tile, dir)) continue;
        if (tile.doorLocked && tile.doorDir === dir) continue;
        const d = Tiles.DELTA[dir];
        if (!g.board[KEY(tile.row + d.row, tile.col + d.col)]) out.push(dir);
    }
    return out;
}

function findExitTile(g) {
    for (const k of Object.keys(g.board)) if (g.board[k].kind === 'exit') return g.board[k];
    return null;
}

function dragonDistance(g, char) {
    if (!g.dragons.length) return Infinity;
    if (char.flags.dragonImmune) return Infinity;
    const dist = Utils.bfsDistances(g.board, char.row, char.col);
    let best = Infinity;
    for (const dr of g.dragons) {
        const d = dist[KEY(dr.row, dr.col)];
        if (d !== undefined && d < best) best = d;
    }
    return best;
}

function alliesOnCell(g, char) {
    return g.characters.filter(c => c !== char && !c.escaped && !c.dead &&
        c.row === char.row && c.col === char.col);
}

// ---------------------------------------------------------------------------
// Tile placement choice
// ---------------------------------------------------------------------------

const BAD_KINDS = { 'dragon-lair': 3, bridge: 2, 'door-front': 2, 'door-back': 1, trap: 1 };

/** Score a candidate placement: more frontier = better, hazards = worse. */
function scorePlacement(g, cand, orientation, p, mode) {
    let score = 0;
    // Frontier gained: exits pointing at still-empty cells.
    for (const e of orientation.exits) {
        const d = Tiles.DELTA[e];
        const nk = KEY(p.nr + d.row, p.nc + d.col);
        if (!g.board[nk]) score += 2;
    }
    if (cand.shape === 'deadend') score -= 3;
    score -= (BAD_KINDS[cand.kind] || 0);
    if (cand.kind === 'exit') score += 100;
    if (mode === 'explore' && cand.kind === 'trap') score -= 1;
    return score;
}

function decidePlacement(room, char) {
    const g = room.game;
    const p = g.pending;
    const state = Game.buildState(room);
    const pend = state.pending;
    if (!pend) return { action: 'end-turn' };

    let best = null;
    for (const cand of pend.candidates) {
        for (const o of cand.orientations) {
            const s = scorePlacement(g, cand, o, p, pend.mode);
            if (!best || s > best.score) best = { score: s, source: cand.source, rotation: o.rotation, cand };
        }
    }
    // Gnome's "Repli stratégique": redraw a really bad tile (dead end / lair).
    if (pend.canReroll && best && best.score < 0 && best.cand.kind !== 'exit') {
        return { action: 'reroll-placement' };
    }
    return { action: 'confirm-placement', payload: { source: best.source, rotation: best.rotation } };
}

// ---------------------------------------------------------------------------
// Turn decision
// ---------------------------------------------------------------------------

/**
 * opts.style : 'explore' (spread out, 1 AP = tile + move)
 *            | 'discover' (stay clustered, reveal without moving)
 * opts.effort: 'never' | 'safe' (only at full HP) | 'always'
 * opts.selfHeal : boolean
 */
function decide(room, char, opts) {
    const g = room.game;
    if (g.pending) return decidePlacement(room, char);
    if (!char.conscious) return { action: 'end-turn' };

    // Off the board after a Marche de l'Ombre: reappearing is the only move.
    if (char.shadowOut) {
        const dest = Object.keys(g.board).find(k => {
            const t = g.board[k];
            return t.kind === 'gloom' || t.state === 'dark';
        });
        return dest ? { action: 'shadow-return', payload: { destCell: dest } } : { action: 'end-turn' };
    }

    const ap = g.ap;
    const free = g.freeMoves;
    const here = g.board[KEY(char.row, char.col)];
    const exitTile = findExitTile(g);
    const dragonDist = dragonDistance(g, char);

    // Standing on the Exit: safe, immune and untargetable. The only reason to
    // step back into the dungeon is to wake a fallen team-mate.
    if (char.escaped) {
        const rescue = opts.rescue !== false ? planRescue(g, char, ap, free) : null;
        return rescue || { action: 'end-turn' };
    }

    // --- 0. A Parchemin costs no action point and buys back a whole
    // adventurer's worth of turns: never sit on one while somebody is down.
    if (g.itemsEnabled && g.scrolls > 0) {
        const downedAnywhere = g.characters.find(c => !c.conscious && !c.dead && !c.escaped);
        if (downedAnywhere) return { action: 'use-scroll', payload: { targetId: downedAnywhere.id } };
    }

    // --- 1. Paladin: kill an adjacent dragon (cheap and permanent) ----------
    if (char.flags.slayDragon && ap >= 1) {
        const adj = g.dragons.some(dr =>
            (Math.abs(dr.row - char.row) === 1 && dr.col === char.col) ||
            (Math.abs(dr.col - char.col) === 1 && dr.row === char.row));
        if (adj) return { action: 'ability', payload: { abilityId: 'slay-dragon' } };
    }

    // --- 2. Revive an unconscious ally standing on my tile ------------------
    const onCell = alliesOnCell(g, char);
    const downed = onCell.filter(c => !c.conscious);
    if (downed.length) {
        if (char.flags.balmHeal && ap >= 1) {
            return { action: 'ability', payload: { abilityId: 'apply-balm', targetId: downed[0].id } };
        }
        if (ap >= 2) return { action: 'heal', payload: { targetId: downed[0].id } };
    }
    // 2a. Top up an ally about to drop: 2 AP now beats losing all his turns.
    const fragile = onCell.filter(c => c.conscious && c.hp <= 1);
    if (fragile.length) {
        if (char.flags.balmHeal && ap >= 1) {
            return { action: 'ability', payload: { abilityId: 'apply-balm', targetId: fragile[0].id } };
        }
        if (ap >= 2 && opts.selfHeal) return { action: 'heal', payload: { targetId: fragile[0].id } };
    }

    // --- 2b. Walk over to revive a downed ally (worth 2 AP/turn afterwards) --
    if (opts.rescue !== false) {
        const rescue = planRescue(g, char, ap, free);
        if (rescue) return rescue;
    }

    // --- 3. Head for the exit once it is on the board -----------------------
    if (exitTile) {
        const move = planMoveToward(g, char, KEY(exitTile.row, exitTile.col), ap, free);
        if (move) return move;
    }

    // --- 4. Dragon alert. A dragon advances 1 tile per round and knocks its
    // victim out instantly, so react from 2 tiles away, not 1.
    if (dragonDist <= 2 && !char.flags.dragonImmune) {
        const flee = planFlee(g, char, ap, free);
        if (flee) return flee;
        if (ap >= 2 && !char.hidden) return { action: 'hide' };
    }

    // --- 5. Self-care -------------------------------------------------------
    if (opts.selfHeal && char.hp === 1 && ap >= 2) {
        const healer = onCell.find(c => c.conscious && c.flags.balmHeal);
        if (!healer) return { action: 'heal', payload: { targetId: char.id } };
    }

    // --- 5b. Pair strategy: the "support" of each pair shadows its explorer so
    // healing (2 AP, same tile only) stays possible instead of scattering.
    if (opts.style === 'pairs') {
        const buddy = pairBuddy(g, char);
        if (buddy) {
            const bk = KEY(buddy.row, buddy.col);
            if (bk !== KEY(char.row, char.col)) {
                const m = planMoveToward(g, char, bk, ap, free);
                if (m) return m;
            }
        }
    }

    // --- 6. Explore / discover ---------------------------------------------
    if (free > 0) {
        // A Run / Celerity is in progress: only movement is legal.
        const m = planMoveToward(g, char, bestFrontierTarget(g, char), ap, free);
        if (m) return m;
        return { action: 'end-turn' };
    }

    if (ap >= 1) {
        const dirs = freeDirs(g, here);
        if (dirs.length) {
            const dir = pickExploreDir(g, char, here, dirs);
            // A support reveals tiles WITHOUT moving, so it stays next to its
            // explorer and keeps the option to heal it.
            const isSupport = opts.style === 'pairs' && pairBuddy(g, char);
            const mode = (opts.style === 'discover' || isSupport) ? 'discover' : 'explore';
            return { action: mode, payload: { dir } };
        }
        // No frontier here: walk to the nearest tile that still has one.
        const target = bestFrontierTarget(g, char);
        if (target) {
            const m = planMoveToward(g, char, target, ap, free);
            if (m) return m;
        }
    }

    // --- 7. Nothing left to do: maybe push with an Effort -------------------
    if (ap <= 0 && free <= 0 && !g.effortUsed) {
        const wantsMore = !!exitTile || freeDirs(g, here).length > 0;
        const ok = opts.effort === 'always' ||
            (opts.effort === 'safe' && char.hp >= char.maxHp);
        if (wantsMore && ok) return { action: 'effort' };
    }
    return { action: 'end-turn' };
}

/**
 * Pair the adventurers two by two in turn order. The second of each pair is
 * the "support": it never explores on its own, it follows its explorer so it
 * can heal / revive it. Returns the explorer to shadow, or null for explorers.
 */
function pairBuddy(g, char) {
    const live = g.characters.filter(c => !c.escaped && !c.dead);
    const i = live.indexOf(char);
    if (i < 0 || i % 2 === 0) return null;      // even index = explorer
    const explorer = live[i - 1];
    if (!explorer || !explorer.conscious) return null;
    return explorer;
}

/** Pick the exploration direction that pushes furthest from the party centre. */
function pickExploreDir(g, char, here, dirs) {
    const dragons = g.dragons;
    let best = dirs[0], bestScore = -Infinity;
    for (const dir of dirs) {
        const d = Tiles.DELTA[dir];
        const nr = char.row + d.row, nc = char.col + d.col;
        let s = 0;
        // Prefer cells with fewer already-placed neighbours (open space).
        for (let k = 0; k < 4; k++) {
            const dd = Tiles.DELTA[k];
            if (!g.board[KEY(nr + dd.row, nc + dd.col)]) s += 1;
        }
        // Keep away from dragons.
        for (const dr of dragons) {
            const md = Math.abs(dr.row - nr) + Math.abs(dr.col - nc);
            if (md <= 2) s -= (3 - md) * 4;
        }
        if (s > bestScore) { bestScore = s; best = dir; }
    }
    return best;
}

/** Nearest placed tile that still has an unexplored side. */
function bestFrontierTarget(g, char) {
    const { dist } = planPaths(g, char, { openDoors: true });
    let best = null, bestD = Infinity;
    for (const k of Object.keys(g.board)) {
        const t = g.board[k];
        if (!freeDirs(g, t).length) continue;
        const d = dist[k];
        if (d === undefined || d === 0) continue;
        if (d < bestD) { bestD = d; best = k; }
    }
    return best;
}

/**
 * Emit the next action along the shortest route to `targetKey`.
 * Handles Run, locked doors and fires blocking the way.
 */
function planMoveToward(g, char, targetKey, ap, free) {
    if (!targetKey) return null;
    const startKey = KEY(char.row, char.col);
    if (targetKey === startKey) return null;
    const { dist, prev } = planPaths(g, char, { openDoors: true });
    if (dist[targetKey] === undefined) return null;
    const steps = reconstruct(prev, startKey, targetKey);
    if (!steps || !steps.length) return null;
    const s = steps[0];

    // A locked door on my own tile blocks that edge: pick it first.
    if (s.locked) {
        if (char.flags.lockpickCheap && ap >= 1) return { action: 'ability', payload: { abilityId: 'lockpicking' } };
        if (ap >= 2) return { action: 'pick-lock', payload: {} };
        return null;
    }
    const act = stepAction(char, s.tile);
    if (act === 'extinguish') {
        if (char.flags.extinguishCheap && ap >= 1) {
            return { action: 'ability', payload: { abilityId: 'flame-mastery', cell: KEY(s.tile.row, s.tile.col) } };
        }
        if (ap >= 2) return { action: 'extinguish', payload: { cell: KEY(s.tile.row, s.tile.col) } };
        return null;
    }
    if (act === 'walk-dark' || act === 'walk-bridge') {
        if (ap >= 2) return { action: act, payload: { dir: s.dir } };
        return null;
    }
    // Plain move: spend a free move if we have one, else consider Run/Celerity.
    if (free > 0) return { action: 'move', payload: { dir: s.dir } };
    const cheapRun = steps.slice(0, 3).every(st => stepAction(char, st.tile) === 'move');
    if (ap >= 2 && steps.length >= 3 && cheapRun) {
        if (char.flags.animalCelerity && ap >= 1 && steps.length >= 2) {
            return { action: 'ability', payload: { abilityId: 'animal-celerity' } };
        }
        return { action: 'run', payload: {} };
    }
    if (char.flags.animalCelerity && ap >= 1 && steps.length >= 2 &&
        steps.slice(0, 2).every(st => stepAction(char, st.tile) === 'move')) {
        return { action: 'ability', payload: { abilityId: 'animal-celerity' } };
    }
    if (ap >= 1) return { action: 'move', payload: { dir: s.dir } };
    return null;
}

/**
 * Go and wake up an unconscious team-mate. Only the CLOSEST conscious
 * adventurer takes the job, so the whole party does not drop everything.
 */
const RESCUE_RANGE = 7;
function planRescue(g, char, ap, free) {
    const downed = g.characters.filter(c =>
        c !== char && !c.conscious && !c.escaped && !c.dead);
    if (!downed.length) return null;

    const mine = planPaths(g, char, { openDoors: true }).dist;
    const others = g.characters.filter(c =>
        c !== char && c.conscious && !c.escaped && !c.dead)
        .map(c => planPaths(g, c, { openDoors: true }).dist);

    let best = null;
    for (const d of downed) {
        const k = KEY(d.row, d.col);
        const cost = mine[k];
        if (cost === undefined || cost === 0 || cost > RESCUE_RANGE) continue;
        // Someone else is nearer: let them handle it.
        if (others.some(od => od[k] !== undefined && od[k] < cost)) continue;
        if (!best || cost < best.cost) best = { cost, key: k };
    }
    if (!best) return null;
    return planMoveToward(g, char, best.key, ap, free);
}

/**
 * Step to the reachable neighbour that maximises distance from the dragons.
 * Buys a Run first when it is available, since outrunning a dragon needs to
 * gain more than the one tile it moves each round.
 */
function planFlee(g, char, ap, free) {
    if (ap < 1 && free < 1) return null;
    const here = g.board[KEY(char.row, char.col)];
    const hereDist = dragonDistance(g, char);
    let best = null, bestScore = -Infinity;
    for (let dir = 0; dir < 4; dir++) {
        if (!Utils.edgeConnected(g.board, here, dir)) continue;
        const d = Tiles.DELTA[dir];
        const nb = g.board[KEY(char.row + d.row, char.col + d.col)];
        if (!nb) continue;
        if (stepAction(char, nb) !== 'move') continue;
        if (g.dragons.some(dr => dr.row === nb.row && dr.col === nb.col)) continue;
        const dd = Utils.bfsDistances(g.board, nb.row, nb.col);
        let mind = Infinity;
        for (const dr of g.dragons) {
            const v = dd[KEY(dr.row, dr.col)];
            if (v !== undefined && v < mind) mind = v;
        }
        if (mind > bestScore) { bestScore = mind; best = dir; }
    }
    if (best === null || bestScore <= hereDist) return null;
    // Only 1 AP left and still cornered next round: better to buy 3 moves.
    if (free === 0 && ap >= 2 && bestScore <= 2) return { action: 'run', payload: {} };
    return { action: 'move', payload: { dir: best } };
}

module.exports = { decide, findExitTile, planPaths, freeDirs };
