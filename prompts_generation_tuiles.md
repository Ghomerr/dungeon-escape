# Guide et Prompts pour la Génération des Tuiles de Donjon

Ce document contient l'ensemble des descriptions et prompts (en anglais pour une meilleure compatibilité avec les IA de génération d'images comme Midjourney, DALL-E 3 ou Stable Diffusion) pour générer les 66 tuiles du jeu (64 tuiles Donjon, 1 tuile Départ, 1 tuile Sortie).

Le style demandé est inspiré des dessins classiques de jeux de rôle (type Donjons & Dragons), avec un aspect dessiné à la main (encre et aquarelle sur parchemin usé) en vue de dessus (orthographique). 

---

## 🎨 Spécifications de Style Global

Pour garantir la cohérence esthétique et la connectivité des tuiles :
1. **Vue de dessus stricte (Orthographic Top-Down View)** : Éviter toute perspective 3D ou isométrique afin que les couloirs s'alignent parfaitement.
2. **Connecteurs standards** : Les couloirs doivent arriver exactement au centre de chaque bord de tuile carrée, avec une largeur constante (ex. 40% de la largeur de la tuile).
3. **Palette de couleurs** : Tons pierre grise, dalles usées, beige parchemin, avec des touches de couleurs selon le type de tuile (vert acide pour le poison, orange/rouge pour le feu, bleu/violet sombre pour la pénombre).
4. **Style artistique** : *Hand-drawn fantasy RPG map tile, pen and ink cross-hatching, watercolor wash on aged parchment, D&D rulebook illustration style, highly detailed.*

---

## 📋 Structure d'un Prompt type

Pour générer les tuiles, combinez le **Style de Base** avec le **Prompt Spécifique** de la tuile.

**Base du Prompt (Style) :**
> `Top-down orthographic view of a single square dungeon map tile, hand-drawn D&D fantasy RPG style, pen and ink, watercolor on aged parchment, clear borders. The corridor ends connect perfectly at the center of the edges. [PROMPT SPÉCIFIQUE DE LA TUILE]`

---

## 🚪 Gestion des Portes Verrouillées (Avant / Arrière)

Pour distinguer visuellement le sens de pose et de blocage des portes, nous intégrons une signalétique claire dans le dessin de la tuile :
*   **Sens Avant (Forward Locked Door)** : La porte verrouillée bloque la sortie de la tuile. Une grande flèche stylisée est gravée sur le sol, pointant **vers** la porte (vers l'avant). La porte est au fond du couloir, scellée par des chaînes et un cadenas.
*   **Sens Arrière (Backward Locked Door)** : La porte verrouillée bloque le retour en arrière (l'entrée de la tuile). Une flèche sur le sol pointe **vers l'arrière** (vers l'entrée). Une grille métallique ou une lourde porte vient de se refermer et de se verrouiller derrière le point d'entrée.

---

## 🗺️ Liste détaillée des 66 Tuiles et Prompts Spécifiques

### 🏁 Tuiles Spéciales (2 tuiles)

#### 1. Tuile de Départ (x1)
*   **Description** : Une salle centrale sûre, sol en pavés réguliers, éclairée par quatre torches murales réconfortantes, avec des départs de couloirs dans les quatre directions.
*   **Prompt** : `A safe starting chamber with stone tile floor, four lit torches in brackets on the stone walls illuminating the room, welcoming atmosphere, corridors exiting in all four cardinal directions.`

#### 2. Tuile de Sortie (x1)
*   **Description** : Un grand portail en fer forgé entrouvert, laissant filtrer des rayons de lumière divine ou de soleil de l'extérieur. Des marches mènent vers le haut.
*   **Prompt** : `A grand dungeon exit chamber, heavy iron gates slightly ajar, bright shafts of natural sunlight beaming down from above onto stone steps leading out of the dungeon, sense of hope and escape.`

---

### 🧱 Tuiles Simples (16 tuiles)
*Toutes sont inoffensives. Leurs prompts contiennent des détails uniques pour les différencier.*

#### Cul-de-sac Simples (2 tuiles)
*   **Tuile 3 (Cul-de-sac A)** : `A dead-end stone corridor ending abruptly in a solid dark stone wall, old cobwebs hanging in the corners.`
*   **Tuile 4 (Cul-de-sac B)** : `A dead-end stone corridor blocked by a heap of collapsed gravel and wooden support beams.`

#### Couloirs Simples (4 tuiles)
*   **Tuile 5 (Couloir A)** : `A straight stone corridor, clean masonry slabs, ancient weathered flagstones.`
*   **Tuile 6 (Couloir B)** : `A straight stone corridor, cracked floor slabs with a puddle of water reflecting light in the middle.`
*   **Tuile 7 (Couloir C)** : `A straight stone corridor, a discarded unlit iron torch lying on the ground, minor scratch marks on the walls.`
*   **Tuile 8 (Couloir D)** : `A straight stone corridor, thin green moss growing along the seams of the stone walls and floor.`

#### Carrefours Simples (3 tuiles)
*   **Tuile 9 (Carrefour A)** : `A 4-way crossroad intersection chamber, plain stone archways leading to all four directions.`
*   **Tuile 10 (Carrefour B)** : `A 4-way crossroad intersection chamber, a rusty round iron sewer grating centered on the floor.`
*   **Tuile 11 (Carrefour C)** : `A 4-way crossroad intersection chamber, faint ancient runes lightly carved into the floor stone.`

#### Couloirs en T Simples (3 tuiles)
*   **Tuile 12 (T-junction A)** : `A T-shaped stone corridor junction, clean walls and floors.`
*   **Tuile 13 (T-junction B)** : `A T-shaped stone corridor junction, an empty decayed wooden chest sitting in the corner.`
*   **Tuile 14 (T-junction C)** : `A T-shaped stone corridor junction, rusted metal chains hanging loose from the ceiling.`

#### Coudes Simples (4 tuiles)
*   **Tuile 15 (Coude A)** : `A 90-degree L-turn stone corridor, plain stone walls.`
*   **Tuile 16 (Coude B)** : `A 90-degree L-turn stone corridor, an old wooden barrel sitting in the corner.`
*   **Tuile 17 (Coude C)** : `A 90-degree L-turn stone corridor, a small wall niche containing a cracked clay urn.`
*   **Tuile 18 (Coude D)** : `A 90-degree L-turn stone corridor, skeleton bones scattered neatly along the inner corner.`

---

### 🌉 Tuiles Ponts Suspendus (3 tuiles)
*Un pont en bois au-dessus d'un gouffre sans fond.*

*   **Tuile 19 (Pont A)** : `A wooden plank suspension bridge spanning across a dark bottomless abyss, thick ropes securing the bridge.`
*   **Tuile 20 (Pont B)** : `A wooden plank suspension bridge over a dark abyss, one or two planks are visibly broken or missing.`
*   **Tuile 21 (Pont C)** : `A wooden plank suspension bridge over a dark abyss, frayed ropes, eerie white fog rising from the depths below.`

---

### 🔒 Tuiles Portes Verrouillées (6 tuiles)

#### Sens Avant (x3) - Obstacle devant
*   **Tuile 22 (Porte Avant A)** : `A straight corridor with a heavy oak door with iron studs blocking the far exit. A large ornate arrow is engraved on the stone floor, pointing forward towards the door. A padlock symbol is visible on the door.`
*   **Tuile 23 (Porte Avant B)** : `A straight corridor with a solid iron door barred with heavy chains and a padlock blocking the far exit. A stylized arrow is painted on the floor pointing forward towards the door.`
*   **Tuile 24 (Porte Avant C)** : `A straight corridor with a locked rusted portcullis blocking the far exit. A carved stone arrow on the floor points forward towards the portcullis.`

#### Sens Arrière (x3) - Bloque le retour
*   **Tuile 25 (Porte Arrière A)** : `A straight corridor with a locked wooden door blocking the entrance end. A large ornate arrow is engraved on the floor pointing backward towards the locked entry door.`
*   **Tuile 26 (Porte Arrière B)** : `A straight corridor with a heavy iron portcullis slammed down and locked behind the entrance end. A stylized arrow is painted on the floor pointing backward towards the gate.`
*   **Tuile 27 (Porte Arrière C)** : `A straight corridor with a solid stone slab door blocking the entrance end. A carved stone arrow on the floor points backward towards the stone barrier.`

---

### ⚠️ Tuiles Plaques Piégées (3 tuiles)
*Carrefours avec pièges détectables au sol.*

*   **Tuile 28 (Piège A)** : `A 4-way crossroad intersection chamber, a slightly raised pressure plate square tile in the center, hinting at a mechanism.`
*   **Tuile 29 (Piège B)** : `A 4-way crossroad intersection chamber, small circular spike holes peppered around the center tile of the floor.`
*   **Tuile 30 (Piège C)** : `A 4-way crossroad intersection chamber, a pressure plate with faint, ominous red glowing runes carved on it.`

---

### 🔥 Tuiles Inflammables (12 tuiles)
*Tuiles sèches et prêtes à s'enflammer. Elles comportent des valeurs de dés (1 à 6) gravées de manière visible dans la roche.*

#### Couloirs en T Inflammables (8 tuiles)
*   **Tuile 31 (T Inflammable 1-3)** : `A T-shaped dry stone corridor junction with wooden supports, dry straw on the floor. The numbers "1" and "3" are clearly carved on the stone floor.`
*   **Tuile 32 (T Inflammable 1-4)** : `A T-shaped dry stone corridor junction, a small puddle of flammable oil. The numbers "1" and "4" are clearly carved on the stone floor.`
*   **Tuile 33 (T Inflammable 1-5)** : `A T-shaped dry stone corridor junction, dry spiderwebs cover the walls. The numbers "1" and "5" are clearly carved on the stone floor.`
*   **Tuile 34 (T Inflammable 1-6)** : `A T-shaped dry stone corridor junction, cracked coal deposits on the wall. The numbers "1" and "6" are clearly carved on the stone floor.`
*   **Tuile 35 (T Inflammable 2-3)** : `A T-shaped dry stone corridor junction, dry wooden beams supporting the ceiling. The numbers "2" and "3" are clearly carved on the stone floor.`
*   **Tuile 36 (T Inflammable 2-4)** : `A T-shaped dry stone corridor junction, dry wooden barrels stacked in the corner. The numbers "2" and "4" are clearly carved on the stone floor.`
*   **Tuile 37 (T Inflammable 2-5)** : `A T-shaped dry stone corridor junction, small dry roots breaking through walls. The numbers "2" and "5" are clearly carved on the stone floor.`
*   **Tuile 38 (T Inflammable 2-6)** : `A T-shaped dry stone corridor junction, dusty parchment sheets scattered on the ground. The numbers "2" and "6" are clearly carved on the stone floor.`

#### Coudes Inflammables (4 tuiles)
*   **Tuile 39 (Coude Inflammable 3-5)** : `A 90-degree L-turn dry stone corridor with dry wooden supports. The numbers "3" and "5" are clearly carved on the stone floor.`
*   **Tuile 40 (Coude Inflammable 3-6)** : `A 90-degree L-turn dry stone corridor, dry leaves swept into the corner. The numbers "3" and "6" are clearly carved on the stone floor.`
*   **Tuile 41 (Coude Inflammable 4-5)** : `A 90-degree L-turn dry stone corridor, cracked coal seams on the wall. The numbers "4" and "5" are clearly carved on the stone floor.`
*   **Tuile 42 (Coude Inflammable 4-6)** : `A 90-degree L-turn dry stone corridor, an old crate containing dry firewood. The numbers "4" and "6" are clearly carved on the stone floor.`

---

### 🤢 Tuiles Nauséabondes (8 tuiles)
*Tuiles associées aux égouts et au poison. Teintes verdâtres, tuyaux, flaques toxiques.*

#### Coudes Nauséabonds (6 tuiles)
*   **Tuile 43 (Coude Nauséabond A)** : `A 90-degree L-turn stone corridor, damp greenish slime dripping down the walls.`
*   **Tuile 44 (Coude Nauséabond B)** : `A 90-degree L-turn stone corridor, a puddle of glowing green toxic liquid on the floor.`
*   **Tuile 45 (Coude Nauséabond C)** : `A 90-degree L-turn stone corridor, overgrown with green glowing mushrooms in the corner.`
*   **Tuile 46 (Coude Nauséabond D)** : `A 90-degree L-turn stone corridor, a leaky iron sewer pipe running along the wall.`
*   **Tuile 47 (Coude Nauséabond E)** : `A 90-degree L-turn stone corridor, thick noxious green mist floating near the ground.`
*   **Tuile 48 (Coude Nauséabond F)** : `A 90-degree L-turn stone corridor, mossy stones coated in dark green grimy sludge.`

#### Couloirs en T Nauséabonds (2 tuiles)
*   **Tuile 49 (T Nauséabond A)** : `A T-shaped stone corridor junction, sewer vents on the floor releasing a faint green gas.`
*   **Tuile 50 (T Nauséabond B)** : `A T-shaped stone corridor junction, a small channel of green stagnant water crossing the floor.`

---

### 🌒 Tuiles Pénombres (8 tuiles)
*Tuiles sombres, ombres allongées, brouillard magique bleu/violet.*

#### Couloirs Pénombres (4 tuiles)
*   **Tuile 51 (Couloir Pénombre A)** : `A straight stone corridor, heavy shadows stretching across the floor, a single flickering candle on a wall bracket.`
*   **Tuile 52 (Couloir Pénombre B)** : `A straight stone corridor, engulfed in a light purple magical mist that obscures the floor.`
*   **Tuile 53 (Couloir Pénombre C)** : `A straight stone corridor, shadows creeping from the corners, dark soot marks on the stone.`
*   **Tuile 54 (Couloir Pénombre D)** : `A straight stone corridor, a cold blueish glow emanating from wall moss, creating deep contrast.`

#### Couloirs en T Pénombres (2 tuiles)
*   **Tuile 55 (T Pénombre A)** : `A T-shaped stone corridor, deep shadows hiding the junction, light wisps of dark fog.`
*   **Tuile 56 (T Pénombre B)** : `A T-shaped stone corridor, dark and dim, illuminated only by a faint violet glowing crystal on the wall.`

#### Carrefours Pénombres (2 tuiles)
*   **Tuile 57 (Carrefour Pénombre A)** : `A 4-way crossroad intersection chamber, engulfed in dim blue light, shadows cast from the pillars.`
*   **Tuile 58 (Carrefour Pénombre B)** : `A 4-way crossroad intersection chamber, dark corners, the center floor has a dark spiral pattern.`

---

### 🐉 Tuiles Antres de Dragons (8 tuiles)
*Lieux de sommeil ou de repaire des dragons. Griffures, or, braises.*

#### Culs-de-sac Antre de Dragon (6 tuiles)
*   **Tuile 59 (Antre Cul-de-sac A)** : `A dead-end stone chamber, the floor covered in scorched black marks and ashes.`
*   **Tuile 60 (Antre Cul-de-sac B)** : `A dead-end stone chamber, a small pile of shiny gold coins and jeweled goblets in the corner.`
*   **Tuile 61 (Antre Cul-de-sac C)** : `A dead-end stone chamber, deep claw marks gouged into the stone walls.`
*   **Tuile 62 (Antre Cul-de-sac D)** : `A dead-end stone chamber, containing a large nest made of charred bones and scales.`
*   **Tuile 63 (Antre Cul-de-sac E)** : `A dead-end stone chamber, a large dragon skull carved as a bas-relief on the back wall.`
*   **Tuile 64 (Antre Cul-de-sac F)** : `A dead-end stone chamber, glowing hot red embers scattered across a sandy floor.`

#### Coudes Antre de Dragon (2 tuiles)
*   **Tuile 65 (Antre Coude A)** : `A 90-degree L-turn stone corridor, claw marks on the floor, gold coins scattered near the corner.`
*   **Tuile 66 (Antre Coude B)** : `A 90-degree L-turn stone corridor, scorched walls from fire breath, minor treasure chests burned to cinders.`

---

## 💡 Conseils pour la Génération par IA

1.  **Génération en planche (Spritesheet) :**
    Si vous souhaitez générer plusieurs tuiles d'un coup pour conserver une cohérence parfaite de couleurs et de texture :
    > Prompt global : `A grid of 9 different modular dungeon tiles, 3x3 layout, top-down orthographic view, D&D hand-drawn watercolor style on aged parchment. Standardized stone corridors connecting seamlessly at the edges. One tile has [TUILE A], one has [TUILE B], etc.`
2.  **Pour Midjourney :**
    *   Utilisez le paramètre `--tile` si vous souhaitez que la texture de fond ou la structure se répète (attention toutefois, cela peut compliquer la distinction individuelle des tuiles).
    *   L'utilisation d'une image de référence (image-to-image) d'une première tuile réussie avec un faible poids d'image (`--iw 0.5` à `1.5`) est excellente pour forcer les suivantes à avoir la même largeur de couloir et le même style de tracé.
