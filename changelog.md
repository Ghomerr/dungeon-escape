# Changelog

All notable changes to Dungeon Escape are documented here.
Versions use a calendar scheme: `vYYYY.MM.DD`.

## v2026.07.14

### Added
- **Action-point aura**: the active adventurer's aura now reflects their action
  points — it blinks white while AP remain, stops blinking (steady) at 0 AP, and
  turns red (blinking, then steady at 0) once an **Effort** is spent (overreach).
- **Character sheet**: each card now shows the adventurer's **level** (small
  badge — dragons target the lowest first) and, for the active adventurer, their
  current **action points** (like the HP line).
- **Turn order**: party cards are listed in the round's play order (rotation from
  the first player), so it's easy to see who plays next and when the round ends.
- **Auto-scroll**: the board recentres on an adventurer when their turn starts.
- **Fireball breach**: the Pyromancer's fireball now leaves a dedicated breach
  overlay (`breach.png`) drawn over the wall, joining the tile's central
  corridor — the tile it stands on no longer rotates. Breaches are stored apart
  from a tile's exits (new `breaches` field) so connectivity works while the art
  stays put.
- **Rules**: added the tile "discard on placement" rule and the detailed fireball
  usage rule.

### Fixed
- **Fireball event**: the blast now always triggers an **Incendie** (Fire) event
  — the old "Éboulement" wording now maps to Fire — instead of a random
  misfortune card.

### Verified (behaviour confirmed correct, no change needed)
- **Dragons without a victim**: a dragon that has no targetable adventurer —
  whether out of range **or** hidden — vanishes (it may return later); it never
  lingers in place.
- **Gnome vs Dragon**: a Gnome can never be knocked out or die from a dragon
  (targeting, knock-out and spawn all respect its `dragonImmune` flag).

### Changed
- **Healing**: an adventurer alone on their tile now heals immediately instead of
  opening a target-selection modal.
- **Placement modal**: a forced placement with a single tile and orientation (e.g.
  a locked-door corridor, whose direction is fixed by the arrow) is placed
  directly instead of showing a pointless one-button modal.
- **Exploration modal**: orientation buttons are now a uniform size.
- **Window title**: removed the emoji next to the active adventurer's name.

## v2026.07.11

### Fixed
- **Tile orientation**: elbow tiles `corner-3` and `corner-4` were drawn in the
  wrong base orientation (NW / SE), so their displayed opening did not match the
  tile's real exits. All elbows are now generated in the same canonical NE
  orientation, fixing the mismatch between what the corridor looked like and the
  moves the game allowed.
- **Locked doors**:
  - A door is now always picked from the tile you stand on (any direction),
    matching the rules — the misleading "pick an adjacent door" behaviour is gone.
  - Doors are now correctly one-way: you can always step **onto** a door tile
    (including a "back door"); a front door only blocks moving/discovering
    forward, a back door only blocks returning. Back-door tiles were previously
    impossible to walk onto.
- **Lock-pick targeting**: clarified the in-game label ("Pick the door blocking
  this passage") to avoid confusion about which door is being picked.
- **Placement orientations**: when placing a tile, every orientation that is
  valid against **all** adjacent tiles is now offered (no more "corridor into a
  wall"), and invalid orientations are filtered out. Tiles such as T-junctions
  now show every legal rotation.
- **Obscurité totale** (total darkness): the veil is lighter so the corridor
  underneath stays faintly visible, and the tile popup now reads "Obscurité
  totale" instead of "Pénombre — Obscurité totale".
- **Broken emojis** replaced with Windows-10-safe ones: flammable tile
  (`🪵` → `🧨`) and hide / stealth (`🫥` → `🙈`).

### Added
- **Run / Animal Celerity**:
  - Can be cancelled (with a full AP refund) as long as no move has started; the
    Run / Celerity button turns into a "Cancel" button until the first move.
  - Only movement is allowed while running (no discovery or exploration).
- **Turn indicator**: the header now shows how many adventurers are left to play
  before the turn ends ("Aventurier X/Y").
- **Active-adventurer aura**: the adventurer whose turn it is now has a pulsing
  white aura (like the dragon) so it stands out on the board.
- **Movement animation**: adventurers and dragons now slide from tile to tile
  over ~1s so their movement is visible.
- **Event toast**: when a bad event occurs, a large colour-coded toast appears in
  the centre of the screen for a few seconds.
- **Always-visible tile description**: clicking a tile now shows its description
  in a permanent panel above the actions, instead of behind an extra click.
- **Character selection screen**: the difficulty now has a short explanation
  underneath, and each player's chosen adventurers are shown with the same board
  pawns instead of emojis.
- **Disconnection handling**:
  - An unexpected disconnection pauses the game instead of ending it; it resumes
    automatically when the missing player(s) return (same id + token).
  - The game stays paused even if **every** player leaves (e.g. a solo player
    pressing F5 or losing connection).
  - The host can end a paused game early; everyone is then returned to the lobby.
  - A paused game (or one with everyone gone) is ended for good and its room
    destroyed after 5 minutes (configurable via the `PAUSE_TIMEOUT_MS` env var).
  - Actions are rejected while a game is paused.
- **Torches** are now drawn as a handle-less radial glow, so they no longer look
  odd when a tile is rotated.

### Changed
- All source-code comments are now in English.
