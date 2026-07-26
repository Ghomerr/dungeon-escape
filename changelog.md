# Changelog

All notable changes to Dungeon Escape are documented here.
Versions use a calendar scheme: `vYYYY.MM.DD`.

## v2026.07.26

### Added
- **Installable PWA**: Dungeon Escape can now be installed to the home screen /
  desktop. Adds a web manifest, dungeon-themed icons (192 / 512, maskable) and a
  service worker that caches the static shell (real-time socket traffic is never
  intercepted). The service worker is served from the site root so its scope
  covers the whole app.
- **Mobile-first responsive layout**: the whole game now adapts from phone to
  desktop.
  - **Lobby**: slimmer header, icon-only footer, and a compact waiting room whose
    room recap (players / difficulty / emojis) stays fixed while the character
    list scrolls under it — with smaller cards showing at least two per row.
  - **Game**: two narrow icon rails around a centred board on phones; the board
    uses the full width on desktop (no more 1100px side gutters).
- **Manual compact / detailed toggle** for each side rail (double-arrow buttons):
  detailed by default on desktop (action names, full adventurer cards), compact
  (icons only) on phones. The choice is remembered per rail.
- **Round action buttons** (compact mode): each action is an icon in a circle
  with small yellow lightning pips showing its action-point cost; the name and
  description live in the tooltip.
- **Journal modal + live toasts**: the log moved into a modal (opened from a
  Journal button, with an unread badge), and every new log line also pops as a
  toast at the bottom of the screen — on both mobile and desktop.
- **Adventurer details on tap**: tapping a party card opens a modal with the
  adventurer's stats and abilities (the hover tooltip is unreachable on touch).
- **Full-screen in-game modals on phones**: questions, direction picker and tile
  orientation dialogs go full-screen on small viewports for readability.

### Changed
- **Compact side rails on phones** show only the essentials: adventurer portrait
  + HP + action-point pips (with the active-player arrow), a colour-coded event
  picto (emoji + name, details in a modal), and icon-only resources.
- **Event zone is always visible** (even when nothing is happening): full inline
  detail on desktop, emoji + name → modal on phones.
- **Header** is leaner on phones: turns-left shows a picto + number (full
  "Tours restants" text on desktop) and the turn info keeps only the active
  adventurer's name.
- **Fireball counter** now shows just the number, like the kits and draw pile.
- **Journal and emoji buttons** moved to the left rail to shorten the actions
  rail; the emoji bar is now a floating popover.

### Fixed
- **Side rails now scroll** when the screen is too short: the rails were growing
  the page instead of scrolling internally, which made their tops unreachable.
- **Emoji button** no longer opens an invisible empty zone at the bottom.

## v2026.07.22

### Added
- **Background music**: the dungeon theme now starts automatically on the lobby
  and in-game pages. Because browsers block autoplay without a user gesture, it
  falls back to starting on the first click / keypress if the browser refuses.
  The on/off choice is remembered (shared between both pages).
- **Live rules & changelog viewer**: the *Rules* link (footer + in-game header)
  and the version tag (→ changelog) now open the markdown rendered in a modal,
  without leaving the game. Content is fetched live, so it always reflects the
  current file (no frozen HTML copy).
- **Fireball counter**: the Pyromancer's remaining fireballs are shown next to
  the lock-pick kits and the draw pile, so the whole party can see them.
- **Ability reminders**: hovering an adventurer's party card recalls their
  abilities and what each one does.
- **Auto-effort**: attempting an action while one action point short now offers
  to spend an **Effort** (+1 PA) and carry out the action in one step — both from
  the action buttons and from board-driven moves.
- **Heal / damage feedback**: a green rising *heart-circle-plus* on a heal and a
  red shaking *heart-crack* on damage pop over the affected adventurer's **token
  on the board**.
- **New adventurer artwork** used throughout, with a clear split: the **full
  illustration** on the selection card (round frame, slightly zoomed to crop the
  drawn border) and the in-game party card, and the round **portrait** on the
  board pawns and the lobby "assigned" pawns. Adventurers are no longer
  designated by emojis anywhere (target menus show the portrait).
- **Dragon artwork**: the **Dragon** event now shows the dragon illustration in
  the current-event reminder and the central toast; dragons on the board use the
  dragon **portrait**; and the lobby screen uses the dragon illustration as a
  faded backdrop behind the connection panel.
- **Dungeon openings always visible**: every cell the dungeon could still grow
  into is now shown at all times — a dim, non-interactive hint by default, and a
  highlighted, clickable slot when the active adventurer can explore / discover
  there.

### Fixed
- **End-turn crash**: passing / ending the turn threw `state is not defined`.
  Fixed (and a matching latent crash on the dangerous-move confirmation).
- **Fireball breach on a later tile**: when the Pyromancer blasted a wall into
  an empty space, the tile discovered there afterwards now also shows the breach
  overlay on its facing edge (it was missing).

### Changed
- **FontAwesome icons**: action / ability buttons, the turn controls (Effort,
  End turn, Cancel), the resource lines (kits, draw pile, fireballs) and the
  action modals (tile menus, direction picker, placement) now use solid
  FontAwesome icons instead of emojis. Reactions and on-tile event icons keep
  their emojis.
- **Music toggle** now reads as a link and shows a hand cursor over its ON/OFF
  icon.
- **Tiles — legibility**: the golden frame and corner ornaments were removed
  from every tile.
- **Tiles — dragon lairs**: lairs are now spacious, imperfectly round chambers
  in dark red (including the elbow lairs, now full rooms with two perpendicular
  exits) so they clearly stand apart. Their decor (chest, bones, gold, skull) is
  no longer baked in — it is generated as standalone overlays
  (`decor-*.png`) and drawn upright over the tile, whatever its rotation.

## v2026.07.20

### Added
- **Dangerous-move confirmation**: moving onto a tile that would cost the
  adventurer HP now asks for confirmation first, recalling the hazard(s) awaiting
  them — a **Dragon** on the tile (instant knock-out), an **active poison**
  (−2 PV, unless shielded by the Paladin) or a **trapped plate** (−1 PV on a
  failed talent roll). Fire tiles are excluded (only the Elf can enter, taking no
  damage).
- **End-turn confirmation**: ending the turn while **action points remain** now
  asks for confirmation (recalling the remaining AP and any free moves) instead
  of ending straight away.

### Fixed
- **Dragon lingering on its victim**: a dragon that ended up on the very same
  tile as a conscious adventurer (e.g. after the adventurer walked onto it) stayed
  idle in place instead of acting. It now **terrasses** the adventurer, honouring
  the rule that a dragon always has a victim or vanishes — it never lingers.
- **Walking onto a Dragon**: an adventurer moving onto a tile occupied by a
  Dragon now correctly drops to 0 PV and falls **unconscious** (previously nothing
  happened). The Gnome's stealth still exempts it.

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

## v2026.07.05

### Added
- **Complete tile art set**: procedurally generated PNGs for every dungeon tile
  — corridors, corners (elbows), crossroads, T-junctions, dead-ends, suspended
  bridges, locked doors (front / back, with open variants), trapped plates,
  flammable, poisonable and gloom tiles, dragon lairs, and the start / exit
  tiles. Replaces the earlier hand-made placeholders (kept under
  `_handmade_backup/`).
- **Adventurer sprites**: individual artwork for the eight adventurers (bard,
  druid, dwarf, elf-rogue, gnome, paladin, pyromancer, shadow-hunter) plus a
  combined reference sheet, used as the board pawns.

## v2026.06.23

### Added
- **Tile-generation pipeline**: documented art-generation prompts
  (`prompts_generation_tuiles.md`) and a reference asset, laying the groundwork
  for the procedural tile set.

## v2026.06.17

### Added
- **First playable build** — real-time multiplayer over Socket.IO.
- **Lobby**: create or join rooms (public or password-protected), random
  room-name generator, live list of ongoing games, character selection,
  difficulty settings, player kick, emoji reactions, and reliable reconnection
  via a per-player id + token.
- **Server game engine**: procedural dungeon / board generation, turn and round
  management, action points, the eight adventurers and their abilities,
  event / misfortune cards, dragons, locked doors, trapped plates, and the
  fire / poison / darkness tile states, plus win / lose resolution.
- **Game client**: dungeon board rendering, party panel, action buttons, event
  log, and the direction / placement / choice dialogs.

## v2026.06.16 (pre-release — documentation & rules)

### Added
- **Project scaffolding**: LICENSE, README and the Node package manifest.
- **Full game rules** (`rules.md`), authored iteratively through June 2026:
  dungeon tiles and event cards, Pyromancer fireballs, Dragon mechanics, and the
  complete adventurer roster.

<!-- Entries above v2026.07.11 were reconstructed from the git history
     (commits 7002c6d → b18d330, 2026-06-01 → 2026-07-05). -->
