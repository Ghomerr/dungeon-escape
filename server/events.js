/**
 * Misfortune cards ("Événements fâcheux").
 *
 * 5 types x 5 cards = 25, plus 1 "x2" card per type = 5 => 30 cards total.
 *
 * Exclusions (from the rules):
 *  - x2 cards are excluded in NORMAL difficulty.
 *  - For each type, 1 card is excluded in EXPERT, and 1 (other) card is
 *    excluded in ADVANCED and EXPERT.
 *
 * After filtering, we shuffle and keep only the count given by the
 * difficulty / character-count table (see DIFFICULTY_TABLE). That count is
 * also the number of turns before "sudden death" (mort subite).
 */

const TYPES = ['fire', 'curse', 'poison', 'dragon', 'gloom'];

const LABELS = {
    fire: 'Incendie',
    curse: 'Malédiction',
    poison: 'Poison',
    dragon: 'Dragon',
    gloom: 'Obscurité totale'
};

function buildEventDeck() {
    const deck = [];
    let uid = 1;
    for (const type of TYPES) {
        for (let i = 0; i < 5; i++) {
            deck.push({
                uid: uid++,
                type: type,
                label: LABELS[type],
                doubled: false,
                // index 0 -> excluded in expert ; index 1 -> excluded in advanced+expert
                excludeExpert: i === 0,
                excludeAdvanced: i === 1
            });
        }
        // one x2 card per type
        deck.push({
            uid: uid++,
            type: type,
            label: LABELS[type] + ' x2',
            doubled: true,
            excludeExpert: false,
            excludeAdvanced: false
        });
    }
    return deck;
}

/**
 * Number of misfortune cards (= number of turns) per characters count and
 * difficulty, straight from the rulebook table.
 */
// `easy` keeps the rulebook's Normal timing: what makes it easier is a shorter
// tile pile and tougher adventurers, not extra turns. The 3 extra cards the
// rulebook suggests ("si vous trouvez que c'est toujours trop difficile, vous
// pouvez ajouter 3 cartes à la pile Danger") are a separate, opt-in concession
// available at every difficulty — see EXTRA_EVENTS.
const DIFFICULTY_TABLE = {
    4: { easy: 22, normal: 22, advanced: 20, expert: 18 },
    5: { easy: 19, normal: 19, advanced: 17, expert: 15 },
    6: { easy: 17, normal: 17, advanced: 15, expert: 13 }
};

/** How many cards the opt-in concession adds to the Danger pile. */
const EXTRA_EVENTS = 3;

/** Cards actually available at a difficulty, once its exclusions are applied. */
function poolSize(difficulty) {
    return filterDeckForDifficulty(buildEventDeck(), difficulty).length;
}

/**
 * Number of misfortune cards, i.e. of turns. `extra` adds the rulebook's
 * concession, capped by what the pile can actually hold — Expert with 4
 * adventurers only has 20 cards to give, so it cannot grant a full +3.
 */
function getEventCount(charactersCount, difficulty, extra) {
    const clamped = Math.max(4, Math.min(6, charactersCount));
    const row = DIFFICULTY_TABLE[clamped];
    const base = row[difficulty] || row.normal;
    return Math.min(base + (extra || 0), poolSize(difficulty));
}

/**
 * Build the misfortune deck for a given difficulty and characters count.
 * Returns an array sized to the rules table (already filtered by difficulty).
 */
/** Difficulty exclusions, shared by the deck builder and the pool-size helper. */
function filterDeckForDifficulty(deck, difficulty) {
    if (difficulty === 'easy' || difficulty === 'normal') {
        return deck.filter(c => !c.doubled);
    }
    if (difficulty === 'advanced') {
        return deck.filter(c => !c.excludeAdvanced);
    }
    if (difficulty === 'expert') {
        return deck.filter(c => !c.excludeAdvanced && !c.excludeExpert);
    }
    return deck;
}

function buildEventDeckForGame(charactersCount, difficulty, shuffleFn, extra) {
    let deck = filterDeckForDifficulty(buildEventDeck(), difficulty);
    deck = shuffleFn(deck);
    const count = getEventCount(charactersCount, difficulty, extra);
    return deck.slice(0, count);
}

module.exports = {
    TYPES,
    LABELS,
    buildEventDeck,
    buildEventDeckForGame,
    getEventCount,
    poolSize,
    EXTRA_EVENTS,
    DIFFICULTY_TABLE
};
