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
// `easy` is not in the rulebook table: it is Normal plus the 3 extra cards the
// rulebook itself suggests ("si vous trouvez que c'est toujours trop difficile,
// vous pouvez ajouter 3 cartes à la pile Danger").
const DIFFICULTY_TABLE = {
    4: { easy: 25, normal: 22, advanced: 20, expert: 18 },
    5: { easy: 22, normal: 19, advanced: 17, expert: 15 },
    6: { easy: 20, normal: 17, advanced: 15, expert: 13 }
};

function getEventCount(charactersCount, difficulty) {
    const clamped = Math.max(4, Math.min(6, charactersCount));
    const row = DIFFICULTY_TABLE[clamped];
    return row[difficulty] || row.normal;
}

/**
 * Build the misfortune deck for a given difficulty and characters count.
 * Returns an array sized to the rules table (already filtered by difficulty).
 */
function buildEventDeckForGame(charactersCount, difficulty, shuffleFn) {
    let deck = buildEventDeck();

    // Apply difficulty exclusions.
    if (difficulty === 'easy' || difficulty === 'normal') {
        deck = deck.filter(c => !c.doubled);
    } else if (difficulty === 'advanced') {
        deck = deck.filter(c => !c.excludeAdvanced);
    } else if (difficulty === 'expert') {
        deck = deck.filter(c => !c.excludeAdvanced && !c.excludeExpert);
    }

    deck = shuffleFn(deck);

    const count = getEventCount(charactersCount, difficulty);
    return deck.slice(0, count);
}

module.exports = {
    TYPES,
    LABELS,
    buildEventDeck,
    buildEventDeckForGame,
    getEventCount,
    DIFFICULTY_TABLE
};
