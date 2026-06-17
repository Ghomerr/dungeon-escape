/**
 * Dungeon tiles : geometry + deck building.
 *
 * Directions are encoded as integers on a square grid:
 *   0 = North, 1 = East, 2 = South, 3 = West
 *
 * A tile exposes a set of "exits" (corridor openings) among those 4 directions.
 * Two adjacent placed tiles are connected when each one has an exit pointing
 * toward the other.
 *
 * For this first local version, tiles are auto-oriented when placed so that
 * they always connect back to the tile the player is exploring from (the rules
 * allow a manual rotation choice; we keep it automatic to stay playable).
 */

const DIRS = { N: 0, E: 1, S: 2, W: 3 };
const DELTA = {
    0: { row: -1, col: 0 }, // N
    1: { row: 0, col: 1 },  // E
    2: { row: 1, col: 0 },  // S
    3: { row: 0, col: -1 }  // W
};

function opposite(dir) {
    return (dir + 2) % 4;
}

/**
 * Compute a tile's exits once we know from which direction it is being entered.
 * @param shape one of deadend|corridor|elbow|tee|cross
 * @param dir   direction FROM the source tile TO this new tile
 */
function computeExits(shape, dir) {
    const opp = opposite(dir); // edge that must connect back to the source
    switch (shape) {
        case 'deadend':
            return [opp];
        case 'corridor':
            return [dir, opp];
        case 'elbow':
            return [opp, (opp + 1) % 4];
        case 'tee':
            // forward + back + one side (drops a single perpendicular)
            return [opp, dir, (opp + 3) % 4];
        case 'cross':
            return [0, 1, 2, 3];
        default:
            return [opp];
    }
}

// Canonical exits per shape (before rotation), used to enumerate the valid
// orientations a player can choose when placing a tile.
const BASE_EXITS = {
    deadend: [0],
    corridor: [0, 2],
    elbow: [0, 1],
    tee: [0, 1, 2],
    cross: [0, 1, 2, 3]
};

function rotateExits(exits, r) {
    return exits.map(e => (e + r) % 4).sort((a, b) => a - b);
}

function exitsForRotation(shape, rotation) {
    return rotateExits(BASE_EXITS[shape] || [0], rotation);
}

/**
 * Distinct orientations of `shape` that connect back to the source tile, i.e.
 * whose exits include opposite(dir). Returns [{ rotation, exits }].
 */
function orientationsFor(shape, dir) {
    const opp = opposite(dir);
    const base = BASE_EXITS[shape] || [0];
    const seen = {};
    const out = [];
    for (let r = 0; r < 4; r++) {
        const ex = rotateExits(base, r);
        if (!ex.includes(opp)) continue;
        const key = ex.join(',');
        if (seen[key]) continue;
        seen[key] = true;
        out.push({ rotation: r, exits: ex });
    }
    return out;
}

/**
 * Apply a chosen orientation (rotation) to a tile being placed in direction
 * `dir` from the source tile. Sets exits and the door edge for door tiles.
 */
function applyOrientation(tile, dir, rotation) {
    tile.exits = exitsForRotation(tile.shape, rotation);
    if (tile.kind === 'door-front') {
        tile.doorDir = dir;               // door on the far (forward) edge
    } else if (tile.kind === 'door-back') {
        tile.doorDir = opposite(dir);     // door on the edge facing the source
    }
    return tile;
}

// The 12 dice-value couples for flammable tiles (one per flammable tile).
const FLAMMABLE_PAIRS = [
    [1, 3], [1, 4], [1, 5], [1, 6],
    [2, 3], [2, 4], [2, 5], [2, 6],
    [3, 5], [3, 6], [4, 5], [4, 6]
];

/**
 * Tile family definitions : how many of each, their shape and their kind.
 * kind drives the special behaviour (fire, poison, gloom, dragon lair, doors…).
 */
const FAMILIES = [
    // --- Simple tiles (16) ---
    { kind: 'simple', shape: 'deadend', count: 2 },
    { kind: 'simple', shape: 'corridor', count: 4 },
    { kind: 'simple', shape: 'cross', count: 3 },
    { kind: 'simple', shape: 'tee', count: 3 },
    { kind: 'simple', shape: 'elbow', count: 4 },
    // --- Bridges (3) ---
    { kind: 'bridge', shape: 'corridor', count: 3 },
    // --- Locked doors (3 + 3) ---
    { kind: 'door-front', shape: 'corridor', count: 3 },
    { kind: 'door-back', shape: 'corridor', count: 3 },
    // --- Trapped crossroads (3) ---
    { kind: 'trap', shape: 'cross', count: 3 },
    // --- Flammable (8 tee + 4 elbow = 12) ---
    { kind: 'flammable', shape: 'tee', count: 8 },
    { kind: 'flammable', shape: 'elbow', count: 4 },
    // --- Nauseous / poisonable (6 elbow + 2 tee = 8) ---
    { kind: 'poisonable', shape: 'elbow', count: 6 },
    { kind: 'poisonable', shape: 'tee', count: 2 },
    // --- Gloom / pénombre (4 corridor + 2 tee + 2 cross = 8) ---
    { kind: 'gloom', shape: 'corridor', count: 4 },
    { kind: 'gloom', shape: 'tee', count: 2 },
    { kind: 'gloom', shape: 'cross', count: 2 },
    // --- Dragon lairs (6 deadend + 2 elbow = 8) ---
    { kind: 'dragon-lair', shape: 'deadend', count: 6 },
    { kind: 'dragon-lair', shape: 'elbow', count: 2 }
];

/**
 * Build the 64-tile exploration deck (unshuffled, no positions yet).
 * Each tile is a plain object; the game module shuffles it and inserts the
 * Exit tile among the last 5.
 */
function buildDeck() {
    const deck = [];
    let uid = 1;
    let pairIndex = 0;

    for (const fam of FAMILIES) {
        for (let i = 0; i < fam.count; i++) {
            const tile = {
                uid: uid++,
                kind: fam.kind,
                shape: fam.shape,
                exits: [],          // set on placement
                row: null,
                col: null,
                state: 'normal'     // normal|fire|poisoned|dark
            };
            if (fam.kind === 'flammable') {
                tile.fireValues = FLAMMABLE_PAIRS[pairIndex++];
            }
            if (fam.kind === 'door-front' || fam.kind === 'door-back') {
                tile.doorLocked = true;
                tile.doorDir = null; // set on placement
            }
            deck.push(tile);
        }
    }
    return deck;
}

function createStartTile() {
    return {
        uid: 0,
        kind: 'start',
        shape: 'cross',
        exits: [0, 1, 2, 3],
        row: 0,
        col: 0,
        state: 'normal'
    };
}

function createExitTile() {
    return {
        uid: 999,
        kind: 'exit',
        shape: 'deadend',
        exits: [],
        row: null,
        col: null,
        state: 'normal'
    };
}

/**
 * Apply orientation to a freshly drawn tile being placed in direction `dir`
 * from the source tile. Mutates and returns the tile.
 */
function orientTile(tile, dir) {
    tile.exits = computeExits(tile.shape, dir);
    if (tile.kind === 'door-front') {
        tile.doorDir = dir;               // door on the far (forward) edge
    } else if (tile.kind === 'door-back') {
        tile.doorDir = opposite(dir);     // door on the edge facing the source
    }
    return tile;
}

module.exports = {
    DIRS,
    DELTA,
    opposite,
    computeExits,
    buildDeck,
    createStartTile,
    createExitTile,
    orientTile,
    orientationsFor,
    exitsForRotation,
    applyOrientation,
    BASE_EXITS,
    FLAMMABLE_PAIRS
};
