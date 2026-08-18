# Audit de difficulté — Dungeon Escape

Audit : 2026-08-17 · Vérifié contre le livret **Sub Terra** et corrigé : 2026-08-18
Moteur audité : `server/game.js`, `tiles.js`, `events.js`, `characters.js`, `utils.js`
Références : `rules.md` puis `regles.pdf` (livret original, 24 p.)
Méthode : lecture ligne à ligne + **7 000 parties simulées** sur le vrai moteur
(voir `tools/sim/README.md`).

**Conclusion en deux lignes :** la transcription `rules.md` est fidèle au livret,
et la difficulté ne vient d'aucune erreur de règle — elle est structurelle (§2).

---

## 1. Taux de réussite mesurés — difficulté Normale

500 parties par taille d'équipe, un seul joueur contrôlant tous les personnages,
équipes tirées au hasard parmi les 8.

| Personnages | Victoires | Or / Argent / Bronze | Sortie découverte | Aventuriers sortis | Tours joués |
| --- | --- | --- | --- | --- | --- |
| **4** | **3,8 %** | 0 / 2 / 17 | 36 % | 0,40 / 4 | 20,0 |
| **5** | **1,2 %** | 0 / 0 / 6 | 45 % | 0,55 / 5 | 18,2 |
| **6** | **1,4 %** | 0 / 1 / 6 | 60 % | 0,81 / 6 | 18,0 |

Tes ~10 parties perdues d'affilée à 4 personnages sont donc **parfaitement
cohérentes** : à 3,8 %, la probabilité de perdre 10 parties de suite est de 68 %.
Le jeu n'est pas « un peu dur », il est **quasiment ingagnable**.

> **Jouer à 5 ou 6 ne compense pas.** Plus de personnages = plus de points
> d'action, mais `rules.md` réduit le nombre de tours (22 → 19 → 17) *et* le
> rang exige toujours au maximum 2 abandonnés : à 6, il faut en sortir **4**,
> contre **2** à 4 personnages. Le solde est négatif.

---

## 2. Diagnostic en une phrase

> Le jeu impose de **piocher 60 à 64 tuiles** pour révéler la SORTIE, ce qui force
> l'équipe à se disperser aux quatre coins du donjon — or **soigner et réanimer
> exigent d'être sur la même tuile**. Les deux impératifs sont mathématiquement
> incompatibles, et l'usure devient irréversible.

Vérifié sur 20 000 initialisations (`tools/sim/check-deck.js`) :

```
60 tuiles : 19,9%   61 : 19,9%   62 : 20,5%   63 : 19,6%   64 : 20,1%
moyenne = 62,0 tuiles à piocher avant de voir la SORTIE
```

C'est bien ce que dit `rules.md` (« mélangée parmi les 5 dernières tuiles »), donc
**le code est fidèle**. C'est la règle elle-même qui est le point de rupture — voir §6.

---

## 3. L'économie de la partie, chiffrée (4 personnages, normal)

### Points d'action

| Poste | PA / partie |
| --- | --- |
| Budget théorique (4 × 2 PA × 20 tours) | 160 |
| **Perdus car inconscient** (24,9 tours à vide) | **−50** |
| Réellement dépensés | 101 |
| — dont pose de tuiles | 47,9 |
| — dont déplacement (`move` + `run`) | 28,3 |
| — dont soins | 9,5 |
| — dont tuiles spéciales (obscurité, pont, incendie, portes) | 9,5 |
| — dont se cacher | 2,5 |

**Il faut 62 PA rien que pour poser les tuiles. L'équipe n'en dispose que de ~48.**
Le manque est structurel : ~31 % des points d'action de toute la partie
disparaissent en tours d'inconscience.

### Points de vie

| Source | Dégâts / partie |
| --- | --- |
| Malédiction | 4,70 PV |
| Poison (2 PV par déclenchement) | 6,80 PV |
| Plaques piégées | 2,41 PV |
| Incendies (3 PV) | 1,95 PV |
| Obscurité totale | 0,83 PV |
| **Total usure** | **16,7 PV** |
| Réserve de départ (4 × 3 PV) | 12 PV |
| Soins effectués (9,5 PA ÷ 2) | +4,75 PV |
| **Disponible** | **16,75 PV** |

L'usure consomme **exactement** toute la réserve de vie de l'équipe, soins compris.
Il ne reste **aucune marge** — et là-dessus viennent s'ajouter :

- **1,51 aventurier terrassé par un Dragon** par partie (mise à 0 PV instantanée,
  quel que soit le nombre de PV restants) ;
- **1,10 aventurier dévoré** en mort subite.

Réanimations réussies : **0,56 pour 2,12 KO**. Un aventurier qui tombe reste au sol.

---

## 4. Ablations — qu'est-ce qui tue réellement la partie ?

200 parties par ligne, 4 personnages, normal.

| Scénario | Victoires | Sortie trouvée | Tuiles posées |
| --- | --- | --- | --- |
| **Référence** | **1 %** | 42 % | 49,6 |
| PV infinis (zéro usure) | 21 % | 79 % | 56,9 |
| **PV infinis + aucun Dragon** | **72 %** | 95 % | 59,9 |
| Sans Dragon (PV normaux) | 7 % | 49 % | 52,2 |
| Sans Poison | 5 % | 44 % | 50,6 |
| Sans Malédiction | 5 % | 49 % | 50,9 |
| +12 tours (34 événements) | 4 % | 41 % | 47,1 |
| +1 PV pour tous | 7 % | 53 % | 52,6 |
| 3 PA par tour | 19 % | 72 % | 55,8 |
| SORTIE à 20 tuiles | 66 % | 98 % | 20,6 |
| SORTIE à 40 tuiles | 19 % | 79 % | 37,8 |

Trois enseignements :

1. **Le temps n'est pas le problème.** Rallonger la partie de 12 tours ne change
   rien (1 % → 4 %) : l'équipe est à terre bien avant la mort subite.
2. **Aucun événement pris isolément n'est coupable.** Supprimer complètement les
   Dragons, ou le Poison, ou la Malédiction : on passe de 1 % à 5-7 %.
   C'est le **cumul** qui tue.
3. **Le budget PA suffirait** si l'équipe ne subissait rien : à PV infinis et
   sans Dragon, 72 % de victoires et 60 tuiles posées au tour 13. Le moteur et
   la géométrie du donjon ne sont donc pas en cause.

### Le piège stratégique

J'ai testé trois styles de jeu, tous les trois perdants pour la même raison :

| Style | Victoires | Tuiles posées | Réanimations |
| --- | --- | --- | --- |
| Dispersion (chacun explore) | 3,8 % | 47,9 | 0,56 |
| Groupé (`discover` sans bouger) | 1 % | 38,6 | — |
| Binômes (1 explorateur + 1 soigneur) | 0,7 % | 31,4 | 0,99 |

En binômes, les réanimations **doublent** et les tours perdus chutent (24,9 → 18,9),
mais le soigneur brûle **35 PA à courir derrière son explorateur** et la pose de
tuiles s'effondre à 31. **Il n'existe aucune stratégie qui satisfasse les deux
contraintes à la fois** — c'est la signature d'un problème d'équilibrage, pas de
niveau de jeu.

---

## 5. Écarts entre le code et `rules.md`

Le moteur est globalement **très fidèle**. Les écarts trouvés sont réels mais
mineurs : aucun n'explique à lui seul le taux de 3,8 %.

> ⚠️ **Section historique (état du 2026-08-17).** Ces écarts ont depuis été
> confrontés au livret Sub Terra puis **corrigés le 2026-08-18** — voir le §7,
> qui fait foi. Les numéros de ligne ci-dessous datent d'avant les correctifs.

### En défaveur des joueurs

| # | Constat | Emplacement |
| --- | --- | --- |
| 1 | **La Boule de feu consomme une carte Événement fâcheux.** Les règles disent seulement qu'elle « déclenche immédiatement un événement Incendie » ; ici elle avance aussi l'horloge de fin de partie. Utiliser les 3 boules = **3 tours de partie en moins**. | [game.js:902](../../server/game.js#L902) |
| 2 | **La Maîtrise des flammes du Nain coûte 2 PA** via l'action standard « Éteindre un incendie » : `char.flags.extinguishCheap ? 2 : 2`. Le rabais à 1 PA n'existe que par le bouton de capacité. | [game.js:748](../../server/game.js#L748) |
| 3 | **La « règle de défausse lors de la pose » n'est pas implémentée** (défausser une tuile qui fermerait toute possibilité d'exploration). Rare, mais peut geler une exploration. | `rules.md` §Règle de défausse |

### En faveur des joueurs

| # | Constat | Emplacement |
| --- | --- | --- |
| 4 | **`hideStreak` n'est jamais remis à zéro** : dès la 3ᵉ utilisation de « Se cacher » dans la partie, **toutes** les suivantes réussissent automatiquement, même non consécutives. Les règles exigent 3 fois *de suite*. | [game.js:796](../../server/game.js#L796) |
| 5 | **Les tuiles Nauséabondes posées pendant un Poison actif ne deviennent pas Empoisonnées**, alors que `rules.md` (l. 177) l'exige explicitement. | [game.js:1157](../../server/game.js#L1157) |
| 6 | **La Marche de l'Ombre téléporte immédiatement** (2 PA) au lieu de « disparaître, puis réapparaître au tour suivant comme seule action ». | [game.js:911](../../server/game.js#L911) |
| 7 | **Les Dragons sont bloqués par les portes verrouillées** (`edgeConnected` refuse la sortie par une porte fermée), alors que les règles disent qu'ils traversent tout sauf les murs. | [utils.js:80](../../server/utils.js#L80) |
| 8 | **« Se cacher » protège toute la manche** (phase Dragon *et* phase Événement). Lecture généreuse mais défendable, et documentée dans le code. | [game.js:218](../../server/game.js#L218) |

### Neutres / à surveiller

| # | Constat | Emplacement |
| --- | --- | --- |
| 9 | **La tuile de réserve du Nain est retirée de la pioche même sans Nain dans l'équipe.** Vérifié : équipe Paladin/Barde/Druide/Elfe → `reserveTile = gloom`, pioche = 64. Une tuile disparaît silencieusement de la partie. | [game.js:138](../../server/game.js#L138) |
| 10 | **`doWalkDark` ne vérifie pas la nature de la tuile visée** (`anyTile: true`) : on peut payer 2 PA pour entrer sur n'importe quelle tuile, y compris un Incendie (et encaisser 3 PV). | [game.js:727](../../server/game.js#L727) |
| 11 | `insertPos` peut valoir `deck.length`, ce qui place la SORTIE en **65ᵉ** position et non parmi les 5 dernières des 64. Décalage d'un rang, sans effet notable. | [game.js:95](../../server/game.js#L95) |

Le reste — table de difficulté, exclusions de cartes par difficulté, jet de talent
à 4+, dégâts (1 PV malédiction / 2 PV poison / 3 PV incendie), portée des dragons
à 7 tuiles, apparition sur l'antre le plus proche, ciblage par niveau croissant,
protection du Paladin, conditions de victoire et rangs — **est conforme**.

---

## 6. Pistes de correction, chiffrées

300 parties par cellule. `pioche NN` = on ne garde que NN tuiles de donjon, la
SORTIE restant mélangée parmi les 5 dernières.

| Piste | 4 persos | 5 persos | 6 persos |
| --- | --- | --- | --- |
| Référence (actuel) | 3 % | 1 % | 2 % |
| Pioche de 45 tuiles | 15 % | 8 % | 11 % |
| Pioche de 40 tuiles | 18 % | 18 % | 15 % |
| Pioche de 35 tuiles | 28 % | 27 % | 22 % |
| Jet de talent réussi sur 3+ | 7 % | 3 % | 2 % |
| +1 PV pour tous | 6 % | 3 % | 2 % |
| +2 PV pour tous | 8 % | 8 % | 8 % |
| **Pioche 45 + 1 PV** | **25 %** | 16 % | 15 % |
| **Pioche 40 + 1 PV** | **33 %** | 27 % | 22 % |
| Pioche 40 + talent 3+ | 27 % | 26 % | 23 % |
| Pioche 45 + 1 PV + talent 3+ | 29 % | 21 % | 22 % |

**Le seul levier qui déplace vraiment l'aiguille est la profondeur de la SORTIE.**
Tout le reste (PV, jets de dés, durée) n'a d'effet qu'une fois ce verrou levé.

### Recommandation

1. **Réduire la pioche d'exploration à 40-45 tuiles**, en gardant la SORTIE parmi
   les 5 dernières. Une seule ligne dans `initGame()` : tronquer `deck` avant
   d'insérer la tuile SORTIE. C'est le correctif à effet maximal et à risque minimal.
2. **Puis** ajuster finement avec +1 PV ou le seuil de jet de talent selon le
   ressenti souhaité.
3. Corriger au passage les écarts #1 (Boule de feu qui consomme un tour) et #2
   (rabais du Nain) qui sont de vrais bugs.

> Les valeurs absolues ci-dessus sont un **plancher** : le bot ne se sert ni du
> Sacrifice du Paladin (se regrouper sur sa tuile annule les dégâts d'Obscurité,
> Poison, Incendie et Malédiction), ni de la Boule de feu, ni de l'Inspiration du
> Barde. Un joueur expert ferait mieux. Mais l'**ordre relatif** des scénarios est
> solide, et la borne haute (`invincible` = 72 %) montre que même un jeu parfait
> plafonnerait sans toucher à la profondeur de la SORTIE.

---

## 7. Vérification contre le livret Sub Terra (2026-08-18)

Le livret original de **Sub Terra** (`regles.pdf`, 24 pages) a été dépouillé et
confronté point par point à `rules.md`. **Ta transcription est remarquablement
fidèle** : les 9 familles de tuiles et leurs effectifs (16 + 8 + 8 + 12 + 8 + 3 +
3 + 3 + 3 = 64), les dégâts (1 PV Secousse, 2 PV Émanations, 3 PV Éboulement),
le jet de talent à 4+, la portée de 7 tuiles des Horreurs, le ciblage par grade
croissant, la table de cartes Danger par difficulté, les rangs Or / Argent /
Bronze et les 8 fiches de spéléo sont tous exacts.

Les trois points laissés en suspens par le précédent audit sont tranchés :

1. **Profondeur de la Sortie : confirmée.** Installation, étape 3 : « Mélanger la
   tuile Sortie avec les cinq dernières tuiles de la pile avant de mettre ces six
   tuiles sous la pile. » Il faut donc bien piocher une soixantaine de tuiles.
   **Le point de rupture identifié au §2 est une règle authentique, pas un bug.**
2. **Jet de talent : 4+ confirmé.** « Lancez le dé, si vous obtenez 4 ou plus
   vous réussissez, sinon vous échouez. »
3. **Poison : 2 PV confirmés** — et le livret est même plus sévère que ne l'était
   le code (voir ci-dessous).

### Écarts réels trouvés, tous corrigés le 2026-08-18

| Écart | Sens | État |
| --- | --- | --- |
| Boule de feu consommant une carte Danger | contre les joueurs | corrigé |
| Boule de feu refusant une paroi pourtant non reliée | contre les joueurs | corrigé |
| Rabais du Nain absent de l'action de base | contre les joueurs | corrigé |
| Orientation de tuile sur-contrainte (le livret n'exige qu'une connexion) | contre les joueurs | corrigé |
| `hideStreak` jamais remis à zéro | pour les joueurs | corrigé |
| Tuiles Nauséabondes révélées pendant un Poison non contaminées | pour les joueurs | corrigé |
| Obscurité ne blessant que les tuiles nouvellement sombres | pour les joueurs | corrigé |
| Inspiration du Barde sans limite par tour | pour les joueurs | corrigé |

**Effet net mesuré : 3,8 % → 1,8 %** de victoires (4 personnages, normal, 500
parties). Les faveurs indues pesaient plus lourd que les pénalités indues : la
difficulté réelle du jeu tel que codé est donc *encore plus* marquée qu'estimé
au §1 — et elle **ne s'explique par aucune erreur de règle**.

### Écarts connus, volontairement non corrigés

- **Les aventuriers sortis quittent la partie.** Dans Sub Terra ils restent sur
  la tuile Sortie, immunisés, et continuent de recevoir 2 PA par tour — ils
  peuvent ressortir pour secourir un camarade. Le modèle `escaped` du moteur les
  retire, ce qui gaspille ces PA de fin de partie. Changement profond touchant
  tout le client : à évaluer séparément.
- **Marche de l'Ombre en un seul temps.** Le livret impose de disparaître, puis
  de réapparaître *au tour suivant, comme seule action du tour*. Le champ
  `shadowOut` existe déjà dans `initGame()` mais la mécanique ne l'utilise pas.
  Correction = nerf, à repousser après un rééquilibrage.
- **Les Dragons sont bloqués par les portes verrouillées** (`edgeConnected`),
  alors que le livret fait traverser corniches et chutes aux Horreurs sans
  contrainte. Correction = nerf.

### Une règle officielle d'assouplissement, non implémentée

Page 5 du livret : « Si après quelques parties vous trouvez que c'est toujours
trop difficile, vous pouvez **ajouter 3 cartes à la pile Danger** lors de
l'étape 5 de la mise en place. »

C'est la réponse des auteurs eux-mêmes au problème. Mesurée ici (§6), elle reste
très insuffisante : +6 tours ne fait passer que de 3 % à 4 %. Le levier utile
demeure la profondeur de la Sortie.

---

## 8. Récapitulatif après le mode Facile et les objets (2026-08-18)

**8 400 parties** — 400 par ligne, personnages tirés au hasard parmi les 8, un
seul joueur contrôlant toute l'équipe. Reproductible avec :

```bash
$NODE tools/sim/matrix.js 400        # ou --md pour cette table
```

| Difficulté | Objets | Persos | Victoires | Or | Argent | Bronze | Sortis (moy.) | Sortis si victoire | Tours (moy.) | Tours si victoire | Sortie trouvée |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Facile | non | 4 | **24,5 %** | 9 | 27 | 62 | 1,06 | 2,46 | 24,6 | 26,9 | 80,8 % |
| Facile | non | 5 | **21,5 %** | 6 | 30 | 50 | 1,48 | 3,49 | 23,4 | 23,8 | 89,3 % |
| Facile | non | 6 | **18,0 %** | 18 | 23 | 31 | 2,06 | 4,82 | 22,3 | 20,8 | 93,3 % |
| Facile | **oui** | 4 | **39,0 %** | 23 | 53 | 80 | 1,43 | 2,63 | 25,5 | 26,5 | 86,3 % |
| Facile | **oui** | 5 | **33,0 %** | 30 | 56 | 46 | 1,99 | 3,88 | 23,4 | 23,1 | 93,5 % |
| Facile | **oui** | 6 | **30,5 %** | 28 | 48 | 46 | 2,56 | 4,85 | 22,4 | 20,7 | 95,8 % |
| Normal | non | 4 | 2,8 % | 0 | 1 | 10 | 0,27 | 2,09 | 19,8 | 25,4 | 24,8 % |
| Normal | non | 5 | 0,8 % | 0 | 1 | 2 | 0,38 | 3,33 | 19,5 | 24,0 | 34,8 % |
| Normal | non | 6 | 0,8 % | 0 | 1 | 2 | 0,53 | 4,33 | 18,9 | 19,3 | 46,0 % |
| Normal | **oui** | 4 | 5,0 % | 1 | 3 | 16 | 0,46 | 2,25 | 21,4 | 24,4 | 40,5 % |
| Normal | **oui** | 5 | 2,0 % | 0 | 3 | 5 | 0,64 | 3,38 | 20,6 | 21,8 | 54,0 % |
| Normal | **oui** | 6 | 1,5 % | 0 | 0 | 6 | 0,84 | 4,00 | 19,8 | 19,3 | 65,5 % |
| Avancé | non | 4 | 1,5 % | 0 | 1 | 5 | 0,17 | 2,17 | 17,4 | 22,5 | 15,3 % |
| Avancé | non | 5 | 0,3 % | 0 | 0 | 1 | 0,26 | 3,00 | 17,0 | 18,0 | 24,3 % |
| Avancé | non | 6 | 0,3 % | 0 | 0 | 1 | 0,38 | 4,00 | 16,7 | 18,0 | 33,8 % |
| Avancé | **oui** | 4 | 2,3 % | 0 | 2 | 7 | 0,32 | 2,22 | 19,4 | 21,8 | 29,8 % |
| Avancé | **oui** | 5 | 0,5 % | 0 | 0 | 2 | 0,44 | 3,00 | 18,2 | 19,5 | 39,0 % |
| Avancé | **oui** | 6 | 0,5 % | 0 | 0 | 2 | 0,66 | 4,00 | 17,6 | 16,0 | 52,5 % |
| Expert | — | 4 | 0,3 % | 0 | 0 | 1 | 0,09 | 2,00 | 16,0 | 20,0 | 9,3 % |
| Expert | — | 5 | 0,0 % | 0 | 0 | 0 | 0,14 | — | 15,8 | — | 14,5 % |
| Expert | — | 6 | 0,0 % | 0 | 0 | 0 | 0,34 | — | 15,1 | — | 30,3 % |

*(Expert interdit les objets, la ligne « oui » n'existe donc pas.)*

### Le mode Facile marche, et c'est bien la pioche qui pilote tout

À 4 personnages, on passe de **2,8 % à 24,5 %** — presque dix fois plus. Le taux
de découverte de la **Sortie** explose de 25 % à 81 % : c'est bien le nombre de
tuiles à piocher, et lui seul, qui décidait des parties (cf. §2 et §6).

### Les objets valent à peu près un demi-cran de difficulté

Ils multiplient le taux de victoire par **1,6 à 1,8** partout où ils sont
autorisés :

| Difficulté (4 persos) | sans objets | avec objets |
| --- | ---: | ---: |
| Facile | 24,5 % | **39,0 %** |
| Normal | 2,8 % | **5,0 %** |
| Avancé | 1,5 % | **2,3 %** |

Ramassé par partie : **3,6 à 5,2 potions** et **0,6 à 0,8 parchemin lu**. Les
potions font le gros du travail (≈ 4 PV rendus gratuitement, soit un tiers de la
réserve de vie d'une équipe de 4) ; les parchemins sont rares mais chacun rachète
les tours restants d'un aventurier tombé.

Effet secondaire notable : avec les objets, les parties **durent plus longtemps**
(19,8 → 21,4 tours en Normal), signe que l'équipe tient debout au lieu de
s'effondrer à mi-parcours.

### Le rang reste dur à monter

Même en Facile avec objets, la victoire moyenne se joue à **2,6 aventuriers
sortis sur 4** : l'essentiel des victoires sont des **Bronze**, et l'**Or** reste
un exploit (23 sur 400 parties, soit 5,8 %). Le rang dépend d'un regroupement
final que le bot ne planifie pas — un joueur humain devrait faire nettement
mieux sur ce point précis.

### Jouer à 5 ou 6 reste pénalisant

Le constat du §1 tient à toutes les difficultés : plus de personnages donne plus
de points d'action, mais moins de tours et un seuil de rang inchangé (au plus
2 abandonnés). À 6, il faut en sortir 4.

> Rappel de méthode : ces chiffres sont un **plancher**. Le bot n'utilise ni le
> Sacrifice du Paladin, ni l'Inspiration du Barde, ni la Boule de feu, et ne
> planifie pas le regroupement final. Les comparaisons entre lignes sont fiables ;
> les valeurs absolues sous-estiment un joueur expérimenté.
