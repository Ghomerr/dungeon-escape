/**
 * The 8 playable adventurers.
 *
 * Each character has:
 *  - id        : stable key
 *  - name      : display name
 *  - level     : tie-breaker for dragon targeting (lowest level is targeted)
 *  - maxHp     : starting / maximum life points
 *  - emoji     : placeholder avatar (no image assets yet)
 *  - color     : token color on the board
 *  - abilities : list of { id, name, cost (PA, 0 = passive), passive, description }
 *
 * The `flags` object lists engine-relevant capabilities so the game logic can
 * check them without hard-coding character ids everywhere.
 */
const CHARACTERS = [
    {
        id: 'shadow-hunter',
        name: "Chasseur de l'Ombre",
        level: 1,
        maxHp: 3,
        emoji: '🥷',
        color: '#6d4c91',
        flags: {
            nightVision: true,        // enters Obscurité totale with a normal Move, takes no damage there
            shadowWalk: true
        },
        abilities: [
            { id: 'shadow-walk', name: 'Marche de l\'Ombre', cost: 2, passive: false, description: 'Sur une tuile Pénombre ou Obscurité totale, disparaît puis réapparaît au prochain tour sur une autre tuile Pénombre / Obscurité totale.' },
            { id: 'night-vision', name: 'Vision nocturne', cost: 0, passive: true, description: 'Les tuiles Obscurité totale ne font perdre aucun PV et peuvent être traversées avec un simple Déplacement.' }
        ]
    },
    {
        id: 'gnome',
        name: 'Gnome',
        level: 2,
        maxHp: 3,
        emoji: '🧙',
        color: '#3f8f5b',
        flags: {
            dragonImmune: true,       // Furtivité : jamais ciblé ni attaqué par un dragon
            mulligan: true            // Repli stratégique : 3 défausses de pioche / partie
        },
        abilities: [
            { id: 'strategic-retreat', name: 'Repli stratégique', cost: 0, passive: true, description: 'Jusqu\'à 3 fois par partie : défausse la tuile piochée lors d\'une Découverte/Exploration et pioche la suivante (à accepter).' },
            { id: 'stealth', name: 'Furtivité', cost: 0, passive: true, description: 'Ne peut pas être poursuivi ni attaqué par un Dragon, même sur la même tuile.' }
        ]
    },
    {
        id: 'dwarf',
        name: 'Nain',
        level: 3,
        maxHp: 3,
        emoji: '🧔',
        color: '#b5651d',
        flags: {
            rockMemory: true,         // garde une tuile de réserve face visible
            extinguishCheap: true     // Maîtrise des flammes : éteint un incendie pour 1 PA
        },
        abilities: [
            { id: 'rock-memory', name: 'Mémoire de la roche', cost: 0, passive: true, description: 'Garde une tuile de réserve face visible : lors d\'une Découverte/Exploration, peut placer la tuile piochée OU celle en réserve.' },
            { id: 'flame-mastery', name: 'Maîtrise des flammes', cost: 1, passive: false, description: 'Éteint un incendie sur sa tuile ou une tuile adjacente (1 PA au lieu de 2).' }
        ]
    },
    {
        id: 'pyromancer',
        name: 'Pyromancien',
        level: 4,
        maxHp: 3,
        emoji: '🧑‍🚀',
        color: '#d9472b',
        flags: {
            fireResist: true,         // Incendies : -1 PV au lieu de -3
            fireball: true            // 3 boules de feu / partie
        },
        abilities: [
            { id: 'fireball', name: 'Boule de feu', cost: 2, passive: false, description: 'Jusqu\'à 3 fois : détruit une paroi pour ouvrir un passage. Déclenche immédiatement un événement fâcheux.' },
            { id: 'fire-resist', name: 'Résistance aux flammes', cost: 0, passive: true, description: 'Les tuiles Incendie ne font perdre qu\'1 PV (au lieu de 3).' }
        ]
    },
    {
        id: 'elf-rogue',
        name: 'Elfe Roublard',
        level: 5,
        maxHp: 3,
        emoji: '🧝',
        color: '#2e9e8f',
        flags: {
            lockpickCheap: true,      // Crochetage : 1 PA, dans la limite des kits
            elvenAgility: true        // entre sur Pont / Incendie pour 1 PA sans dégât
        },
        abilities: [
            { id: 'lockpicking', name: 'Crochetage des portes', cost: 1, passive: false, description: 'Déverrouille une porte (1 PA), dans la limite des kits de crochetage disponibles.' },
            { id: 'elven-agility', name: 'Agilité elfique', cost: 0, passive: true, description: 'Entre sur les tuiles Pont suspendu ou Incendie pour 1 PA et sans subir de dégâts.' }
        ]
    },
    {
        id: 'druid',
        name: 'Druide',
        level: 6,
        maxHp: 3,
        emoji: '🧑‍🌾',
        color: '#7cae3a',
        flags: {
            balmHeal: true,           // Application de beaume : soigne autrui pour 1 PA
            animalCelerity: true      // Célérité animale : 2 déplacements pour 1 PA
        },
        abilities: [
            { id: 'apply-balm', name: 'Application de beaume', cost: 1, passive: false, description: 'Restaure 1 PV à un autre aventurier sur la même tuile (1 PA).' },
            { id: 'animal-celerity', name: 'Célérité animale', cost: 1, passive: false, description: 'Effectue deux actions Se déplacer (1 PA).' }
        ]
    },
    {
        id: 'paladin',
        name: 'Paladin',
        level: 7,
        maxHp: 5,
        emoji: '🛡️',
        color: '#c9a227',
        flags: {
            slayDragon: true,         // Combattre le mal : élimine un dragon adjacent
            sacrifice: true           // protège les autres sur sa tuile des events
        },
        abilities: [
            { id: 'slay-dragon', name: 'Combattre le mal', cost: 1, passive: false, description: 'Élimine un Dragon situé sur une tuile adjacente (1 PA).' },
            { id: 'sacrifice', name: 'Sacrifice', cost: 0, passive: true, description: '5 PV. Les autres aventuriers sur sa tuile ne perdent pas de PV lors des événements Obscurité, Poison, Incendie et Malédiction.' }
        ]
    },
    {
        id: 'bard',
        name: 'Barde',
        level: 8,
        maxHp: 3,
        emoji: '🎻',
        color: '#4a7fd6',
        flags: {
            inspiration: true,        // donne 1 PA à un autre aventurier
            luck: true                // +1 à tous ses jets de talent
        },
        abilities: [
            { id: 'inspiration', name: 'Inspiration', cost: 1, passive: false, description: 'Donne immédiatement 1 point d\'action à un autre aventurier (1 PA).' },
            { id: 'luck', name: 'Chance', cost: 0, passive: true, description: 'Ajoute un bonus de +1 à tous ses jets de talent.' }
        ]
    }
];

module.exports = CHARACTERS;
