# Simulateur de parties — Dungeon Escape

Harnais headless qui fait tourner **le vrai moteur** (`server/game.js`) avec un bot
qui contrôle tous les aventuriers. Toutes les actions passent par
`Game.applyAction()` avec les mêmes payloads que le client web : une partie
simulée est donc une vraie partie, pas une approximation.

Node n'est pas dans le PATH sur cette machine :

```
NODE="E:/Programs/node-v26.4.0-win-x64/node.exe"
```

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `bot.js` | IA heuristique (Dijkstra en coût PA, fuite des dragons, réanimation, choix d'orientation des tuiles) |
| `simulate.js` | Lance N parties, agrège les stats, applique les *tweaks* |
| `ablation.js` | Balayage « on enlève un élément à la fois » |
| `rebalance.js` | Teste des correctifs candidats sur 4/5/6 personnages |
| `by-character.js` | Taux de victoire selon le personnage présent dans l'équipe (lit un dump `--json`) |
| `trace.js` | Rejoue **une** partie et affiche le journal complet + le compte des actions |
| `check-deck.js` | Vérifie la profondeur de la tuile SORTIE dans la pioche |

## Commandes

```bash
# Campagne principale (500 parties par taille d'équipe, ~30 s)
$NODE tools/sim/simulate.js --games 500 --chars 4,5,6 --effort never --json tools/sim/results-normal.json

# Diagnostic : qu'est-ce qui tue la partie ?
$NODE tools/sim/ablation.js 200 4

# Pistes de correction chiffrées
$NODE tools/sim/rebalance.js 300

# Comprendre UNE partie en détail (seed, nb personnages, style)
$NODE tools/sim/trace.js 42 4 explore

# Impact de chaque personnage
$NODE tools/sim/by-character.js tools/sim/results-normal.json 4
```

## Options de `simulate.js`

| Option | Valeurs | Défaut |
| --- | --- | --- |
| `--games` | entier | 100 |
| `--chars` | `4,5,6` | `4,5,6` |
| `--difficulty` | `normal` / `advanced` / `expert` | `normal` |
| `--style` | `explore` (dispersion) / `discover` (sans bouger) / `pairs` (binômes) | `explore` |
| `--effort` | `never` / `safe` (PV pleins) / `always` | `safe` |
| `--no-selfheal` | — | auto-soin actif |
| `--roster` | `random` / `first` / `gnome,paladin,...` | `random` |
| `--seed` | entier (reproductible) | 1 |
| `--tweak` | voir ci-dessous, combinables avec `+` | aucun |
| `--json` | chemin | — |

### Tweaks disponibles

Ce sont des **ablations de diagnostic**, appliquées après `initGame()` — elles ne
modifient pas le moteur.

| Tweak | Effet |
| --- | --- |
| `exitAtNN` | déplace la tuile SORTIE à l'index NN de la pioche |
| `deckNN` | ne garde que NN tuiles de donjon, SORTIE parmi les 5 dernières |
| `turnsPlusN` | N cartes Événement fâcheux en plus (partie plus longue) |
| `hpPlus1` / `hpPlus2` | +1 / +2 PV max pour tous |
| `apPlus1` | 3 PA par tour au lieu de 2 |
| `talent3` | jet de talent réussi sur 3+ au lieu de 4+ |
| `noDragon` / `noPoison` / `noCurse` / `noFire` / `noGloom` | remplace ce type de carte par un autre (même nombre de tours) |
| `hp99` | PV « infinis » — borne haute : le budget PA suffit-il ? |
| `invincible` | `hp99` + aucun dragon — borne haute absolue |

Exemple combiné : `--tweak deck40+hpPlus1+talent3`.

## Protocole pour poursuivre les tests

1. **Toujours comparer à la référence dans le même run.** Le bot évolue ; un
   chiffre absolu d'hier n'est pas comparable à un chiffre d'aujourd'hui.
   `ablation.js` et `rebalance.js` réaffichent systématiquement la ligne
   « référence » en tête pour cette raison.
2. **300 parties minimum par cellule** pour distinguer 3 % de 8 %
   (à 300 parties, l'incertitude à 95 % est d'environ ±2 points vers 5 %).
   1000 parties (~1 min) pour trancher un écart de 2-3 points.
3. **Fixer `--seed`** : le même seed rejoue exactement les mêmes parties, ce qui
   permet de comparer deux versions du moteur à hasard identique.
4. **Après toute modification de `server/`**, relancer :
   `simulate.js --games 500 --chars 4,5,6` puis `ablation.js 200 4`.
5. **Pour comprendre une défaite**, prendre un seed d'une partie perdue et
   lancer `trace.js <seed> 4` : le journal complet du moteur sort tel quel.
6. **Le bot n'est pas un joueur parfait.** Les valeurs absolues sont un
   *plancher*. Ce qui est fiable, c'est l'ordre relatif entre scénarios et les
   bornes hautes (`hp99`, `invincible`), qui encadrent ce qu'un joueur optimal
   pourrait atteindre.

### Limites connues du bot

- Il n'exploite pas le **Sacrifice du Paladin** (se regrouper sur sa tuile
  annule les dégâts d'Obscurité / Poison / Incendie / Malédiction).
- Il n'utilise ni la **Boule de feu** du Pyromancien, ni l'**Inspiration** du
  Barde, ni la **Marche de l'Ombre** du Chasseur.
- Il ne planifie pas le regroupement final : chacun file vers la SORTIE dès
  qu'elle est posée, sans coordination.
- Il choisit l'orientation des tuiles au score local (frontière gagnée), sans
  vision d'ensemble de la forme du donjon.
