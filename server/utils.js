const Tiles = require('./tiles.js');

exports.randomRoomId = () => {
    return 'XXXX'.replace(/[X]/g, () => {
        return (Math.random() * 16 | 0).toString(16).toUpperCase();
    });
};

exports.findIndexById = (array, id) => {
    return array.findIndex((element) => element.id === id);
};

exports.findUserByIdAndToken = (users, id, token) => {
    return users.find(user => user.id === id && user.token === token);
};

exports.findElementById = (array, id) => {
    return array.find(e => e.id === id);
};

exports.shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

exports.deepCopy = (object) => {
    return JSON.parse(JSON.stringify(object));
};

exports.rollDie = () => Math.floor(Math.random() * 6) + 1;

/**
 * Talent roll : a d6, success on 4+ (plus an optional bonus, e.g. Bard's luck).
 * Returns { value, total, success }.
 */
exports.talentRoll = (bonus = 0) => {
    const value = exports.rollDie();
    const total = value + bonus;
    return { value, total, success: total >= 4 };
};

// ---- Board helpers (square grid keyed by "row,col") ----

exports.cellKey = (row, col) => row + ',' + col;

exports.getTileAt = (board, row, col) => board[exports.cellKey(row, col)];

/**
 * Whether you can step from tile A to its neighbour in direction `dir`.
 * Both tiles must expose matching corridor exits.
 *
 * Locked doors are ONE-WAY per the rules: a locked door only blocks LEAVING its
 * own tile in the door's direction. You may always step ONTO a door tile (even a
 * "back door" whose door faces you); you just cannot leave it through the door
 * until it is picked. So we only block egress from `tile` when its own door faces
 * `dir`; the neighbour's door never blocks entry.
 */
/**
 * Whether a tile has a corridor opening toward `dir` — either a native exit or a
 * breach blasted open by the Pyromancer's fireball. Breaches are kept separate
 * from `exits` so the tile's artwork never rotates when a wall is opened.
 */
exports.tileOpensToward = (tile, dir) => {
    if (!tile) return false;
    if (tile.exits.includes(dir)) return true;
    return !!(tile.breaches && tile.breaches.includes(dir));
};

exports.edgeConnected = (board, tile, dir) => {
    if (!exports.tileOpensToward(tile, dir)) return false;
    const d = Tiles.DELTA[dir];
    const neighbour = exports.getTileAt(board, tile.row + d.row, tile.col + d.col);
    if (!neighbour) return false;
    const back = Tiles.opposite(dir);
    if (!exports.tileOpensToward(neighbour, back)) return false;
    // A locked door blocks leaving its own tile through that door edge.
    if (tile.doorLocked && tile.doorDir === dir) return false;
    return true;
};

/**
 * BFS distance (in tiles) from a starting cell to every reachable placed tile.
 * Returns a map cellKey -> distance. Used for dragon targeting / spawning.
 */
exports.bfsDistances = (board, startRow, startCol) => {
    const dist = {};
    const startKey = exports.cellKey(startRow, startCol);
    if (!board[startKey]) return dist;
    dist[startKey] = 0;
    const queue = [board[startKey]];
    while (queue.length) {
        const tile = queue.shift();
        const baseDist = dist[exports.cellKey(tile.row, tile.col)];
        for (let dir = 0; dir < 4; dir++) {
            if (!exports.edgeConnected(board, tile, dir)) continue;
            const d = Tiles.DELTA[dir];
            const nKey = exports.cellKey(tile.row + d.row, tile.col + d.col);
            if (dist[nKey] === undefined) {
                dist[nKey] = baseDist + 1;
                queue.push(board[nKey]);
            }
        }
    }
    return dist;
};

/**
 * First step (direction) along the shortest path from (sr,sc) toward (tr,tc).
 * Returns a direction integer, or null if unreachable / already there.
 */
exports.firstStepToward = (board, sr, sc, tr, tc) => {
    // BFS from the target, then from the source pick the neighbour with the
    // smallest distance to the target.
    const distFromTarget = exports.bfsDistances(board, tr, tc);
    const startTile = exports.getTileAt(board, sr, sc);
    if (!startTile) return null;
    let bestDir = null;
    let bestDist = distFromTarget[exports.cellKey(sr, sc)];
    if (bestDist === undefined) return null;
    for (let dir = 0; dir < 4; dir++) {
        if (!exports.edgeConnected(board, startTile, dir)) continue;
        const d = Tiles.DELTA[dir];
        const nKey = exports.cellKey(sr + d.row, sc + d.col);
        const nd = distFromTarget[nKey];
        if (nd !== undefined && nd < bestDist) {
            bestDist = nd;
            bestDir = dir;
        }
    }
    return bestDir;
};
