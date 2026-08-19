# Changelog

All notable changes to Dungeon Escape are documented here.
Versions use a calendar scheme: `vYYYY.MM.DD`.

## v2026.08.19

### Added
- **Your last 10 games, on the home screen.** Every finished run is now written
  to this browser's local storage and listed under the join form: date and
  duration, a colour-coded difficulty chip, whether items were on (flask +
  scroll) or off (a "no entry" sign), how many players and which adventurers
  (the same round portraits used on the board), the result with its rank and
  survivor count, turns played and tiles left undiscovered. Each row has its own
  delete button, and a "Tout effacer" button clears the lot behind a
  confirmation. Nothing ever leaves the browser.

### Changed
- **Items are more generous.** Potions now hide in one tile out of **four**
  instead of six. A Parchemin is **certain** when the Paladin slays a Dragon,
  and drops **2 times out of 3** when a Dragon gives up and leaves the dungeon
  (a case that used to yield nothing at all). Fires and Fireballs still pay 1
  in 3. Measured effect at 4 adventurers: Facile with items goes from 39 % to
  **54 %** wins, Normal with items from 5 % to **9.3 %**.
- **Loot is legible on the board.** Items are drawn as a FontAwesome flask or
  scroll — never emoji, which render inconsistently — inside a dark disc that
  floats gently and pulses in a coloured halo (green for a Potion, gold for a
  Parchemin), echoing the active adventurer's aura. They sit **above** the
  adventurer tokens, so a tile crowded with four portraits no longer swallows
  the item lying on it.
- **Trapped plates look trapped.** The three plate tiles were three near-identical
  drawings with five dots. They now carry a wide plate peppered with ~30 spike
  holes drawn as small engraved "+" marks, scattered at random and split between
  red (armed) and grey (spent). Each tile is seeded from its own name, so the
  three differ while staying reproducible.

### Fixed
- **Finding an item now announces itself.** A Potion appearing on a freshly
  revealed tile raised a journal line but no toast, so it went unnoticed. It now
  raises one, alongside the existing toasts for drinking a Potion, finding a
  Parchemin and reading one.
- **Facile and Normal read as different difficulties.** They always had distinct
  blurbs in the source, but a browser holding a stale cached `client.js` from
  before Facile existed fell back to Normal's text for both. The service worker
  cache is bumped so the update actually lands.

## v2026.08.18

Every rule below was checked against the original **Sub Terra** rulebook (the
game this one is based on), not just against `rules.md`. Net effect: the game got
slightly *harder*, because most of the divergences were quietly favouring the
players. Normal difficulty is now as close to the printed rules as the engine can
express, and a **Facile** mode plus an optional **objets** variant sit on top of
it for players who want a run they can actually finish.

### Added
- **Facile difficulty.** The audit showed the Exit tile sitting 60-64 tiles deep
  was what decided a run on its own, so Facile cuts the exploration pile to **40
  tiles** (the Exit still shuffled among the last five), gives every adventurer
  **+1 HP**, and deals **3 extra misfortune cards** — the very concession the
  rulebook itself suggests. Measured over 400 games with 4 adventurers: **2.8 %
  → 24.5 %** wins, and the Exit now gets found in 81 % of runs instead of 25 %.
- **Objets variant** (a checkbox next to the difficulty, available everywhere
  except Expert):
  - **Potions** hide in one tile out of six. The first adventurer to step on one
    drinks it for **+1 HP** — and leaves it behind when already at full health,
    so it goes to whoever needs it.
  - **Parchemins** are not found in tiles but earned by cleaning the dungeon up:
    slaying a Dragon (1 in 2), putting out a fire (1 in 3), or blasting a wall
    with a Fireball (1 in 3). They pile up in a **team stock**.
  - Reading a Parchemin puts an unconscious adventurer back on their feet at
    **1 HP, anywhere in the dungeon, for no action point** — the direct answer
    to the death spiral the audit measured (a fallen adventurer used to stay
    down for the rest of the game). The moment somebody drops, the game offers
    to spend one on them. Decline and it stays in stock: it will be offered
    again for the next adventurer to fall, and clicking the counter in the
    resources rail asks **which fallen adventurer** to raise. A Parchemin only
    ever targets an unconscious adventurer, never one already on their feet nor
    one devoured during sudden death.
  - Worth roughly half a difficulty step: **×1.6 to ×1.8** on the win rate
    wherever it is allowed, with 3.6 to 5.2 potions drunk and 0.6 to 0.8
    parchemins read per game.
- **The difficulty panel now states what actually changes**: turns before sudden
  death, size of the exploration pile, bonus HP and whether "x2" events are in.
  No more guessing what "Avancé" costs you.

### Fixed
- **Reaching the Exit no longer takes you out of the game.** The rulebook keeps
  the figure on the Exit tile: safe from every source of damage and invisible to
  the dragons, but *still playing*, with its 2 action points each turn. It can
  now walk back into the dungeon to wake a fallen team-mate and carry the rank
  from Bronze to Gold — a whole layer of endgame decisions that simply did not
  exist before. The run ends when every survivor is on the Exit, or when nobody
  is left in the dungeon at all; when only unconscious adventurers remain and
  somebody is standing on the Exit, the journal now says so instead of ending
  the game behind your back.
- **The Shadow Walk is a two-step ability again.** It used to teleport on the
  spot for 2 AP. The rulebook removes the figure from the board and makes the
  reappearance the *whole* of the next turn: the hunter vanishes (untouchable by
  tiles, events and dragons while gone), then comes back on any revealed
  Pénombre tile — dark or not — as its only action. The action bar collapses to
  a single "Réapparaître" button on that turn.
- **Locked doors no longer stop a dragon.** Dragon pathfinding used the same
  connectivity as adventurers, so a ledge or a drop walled them off. The
  rulebook lets them cross ledges, drops, floods, rubble and squeezes "sans
  contrainte" — only the cave walls stop them. They now hunt, spawn and measure
  their 7-tile range through locked doors.
- **The Fireball no longer costs you a turn.** It used to draw and burn a card
  from the misfortune pile, so the Engineer's three blasts silently cut three
  turns off the doom clock. The rulebook resolves a Cave-in *on the spot*
  without ever spending a Danger card — it now does the same.
- **The Fireball can finally open the wall you are staring at.** It refused any
  side where your own tile had a corridor, even when that corridor died on the
  neighbour's wall — exactly the dead end you wanted to blast through. It now
  looks at whether the two tiles are really connected, and only refuses a
  passage that already exists. Blasting also stops unlocking a door sitting on a
  *different* edge of the tile.
- **The Dwarf's Flame Mastery now works from the action bar.** "Éteindre un
  incendie" charged him the full 2 AP (`extinguishCheap ? 2 : 2`); his 1 AP
  discount only applied through the ability button.
- **Hiding no longer becomes permanently automatic.** The third-attempt free
  success is meant for three *consecutive* rounds; the streak was never reset,
  so from the third hide of the game onward every attempt succeeded outright.
- **Toxic fumes now contaminate tiles revealed while the cloud is up.** The
  rulebook is explicit that this "rend l'action Explorer plus risquée" — a
  Nauséabonde tile drawn during an active Poison is poisoned on the spot.
- **Total darkness hurts everyone standing in it**, not only the adventurers on
  tiles that just went dark.
- **The Bard's Inspiration is once per turn**, as printed on the Leader's sheet.
  With 2 AP he could previously chain it twice.
- **Tile orientation is no longer over-restricted.** The engine demanded that a
  placed tile line up with *every* adjacent tile; the rulebook only asks for a
  connection back to the tile you stand on. Elbows now always offer their 2
  orientations and tees their 3 — the tidy option is still proposed first.

### Changed
- **Tile info moved to right-click / long press.** Left-clicking a tile is how
  you walk onto it, so the description panel popped up over the tile you were
  about to leave and you never got to read it. Inspecting is now a right-click
  on desktop, a long press on touch, and works on your own tile too — useful
  before deciding where to end a turn. The guided tour gained a step explaining
  the gesture, and the board hint mentions it.
- **A drawn tile must be placed.** The discovery modal no longer offers
  "Annuler" (nor a close button): once the tile is off the pile the only choice
  left is its orientation, or the Gnome's redraw. The modal now also prints what
  the tile does underneath the orientations, since the choice is final.

### Tooling
- **`tools/sim/check-fixes.js`**: 38 assertions driving the real engine, one per
  rule fixed above, so a future refactor cannot quietly undo them.
- **`tools/devcheck.js`** gained four probes: the tile panel must open on
  right-click and *not* on a plain click, the placement modal must expose no
  cancel / close affordance while showing a tile description, an adventurer in
  the shadows must see nothing but "Réapparaître", and one standing on the Exit
  must keep a token on the board.
- **`tools/sim/bot.js`** understands the new states: it stays put on the Exit
  unless a rescue is worth the trip, reappears when caught in the shadows, reads
  a Parchemin the moment somebody is down, and detours for a Potion when hurt.
- **`tools/sim/matrix.js`**: the full recap — every difficulty × items on/off ×
  4/5/6 adventurers, reporting win rate, rank breakdown, survivors and turns.
  8 400 games in about a minute; `--md` prints it as a Markdown table.
- **`tools/sim/RAPPORT-AUDIT.md` §8** records that recap, so the effect of a
  future balance change can be read against a known baseline.

## v2026.08.17

### Tooling
- **Headless game simulator** (`tools/sim/`): runs the real engine
  (`server/game.js`) with a heuristic bot controlling every adventurer, driving
  it through `Game.applyAction()` with the same payloads as the web client — so
  a simulated game is a genuine game, not a model of one. 300 games run in about
  3 seconds, which makes balance questions answerable in minutes instead of
  evenings.
  - `simulate.js` aggregates win rate, rank, tiles placed, AP spent per action,
    damage per source and turns lost to unconsciousness.
  - `ablation.js` removes one element at a time (an event type, the dragons, the
    HP attrition) to see which one actually moves the win rate.
  - `rebalance.js` scores candidate fixes across 4/5/6 adventurers,
    `by-character.js` splits results by which adventurer was in the party, and
    `trace.js` replays a single seeded game with the full engine journal.
  - Ablations are applied *after* `initGame()` and never patch the engine, so
    measurements always reflect the shipped rules.
- **Difficulty audit** (`tools/sim/RAPPORT-AUDIT.md`): 7 000 simulated games plus
  a line-by-line comparison of the engine against `rules.md`. Normal difficulty
  currently wins **3.8 %** of games with 4 adventurers, 1.2 % with 5 and 1.4 %
  with 6 — losing ten games in a row is the expected outcome, not bad luck.
  The report documents the cause (the Exit tile sits 60-64 tiles deep, which
  forces the party to scatter, while healing and reviving require standing on
  the same tile), the AP and HP budgets that make it unwinnable, the rule
  deviations found, and the measured effect of each candidate fix.
- **Test protocol** (`tools/sim/README.md`): how to re-run every measurement,
  which sample sizes separate which effect sizes, and the known blind spots of
  the bot (it never uses the Paladin's Sacrifice, the Fireball or the Bard's
  Inspiration), so future numbers stay comparable.

## v2026.08.09

### Added
- **Guided tour ("didacticiel")**: **Poppy**, the dungeon's baby dragon, walks a
  player through the whole interface. Each step spotlights one element of the screen (everything else is
  dimmed) while the dragon explains it in a speech bubble — the dungeon and its
  "+" openings, the party rail, action points, the three action groups, the
  movement colour code, the event box, the doom counter, the shared resources,
  the journal and the end-turn / Effort buttons. It opens on the objectives and
  the win / lose conditions, and closes on the Dragon phase.
  - Enabled from a **checkbox in the waiting room**, ticked by default. The
    choice is per player, saved in local storage, and never proposed again once
    unticked (the tour itself also carries a "don't show again" box).
  - Replayable at any time from the **Didacticiel** button in the game header,
    and dismissable with `Escape` or "Passer".
  - Steps whose target is not on screen are skipped, so the tour adapts to the
    current layout and to the abilities of the active adventurer.
- **Out-of-AP shortcuts on the board**: when the active adventurer runs out of
  action points, an **Effort** and an **End turn** button appear right under
  their token (same round buttons as the compact rail). They disappear once used
  — and after an Effort, the End turn button comes back as soon as the bonus
  point is spent.
- **Passive abilities are tappable**: they now open a modal with their full
  description, on phones as well as on desktop (hover tooltips are unreachable
  on touch screens).
- **Illustrated bad events**: each misfortune card (Fire, Curse, Poison, Dragon,
  Total darkness) and the Sudden death now has its own illustration, shown in the
  central announcement toast and in the left rail. On phones the rail keeps the
  compact emoji + name chip — tapping it opens the modal with the full picture
  and the description.
- **"×2" seal on doubled cards**: a doubled misfortune keeps the artwork of its
  base type, stamped with a red-and-gold **×2** badge — on the illustration
  (toast, rail, modal) and next to the emoji in the compact mobile rail. The
  name drops its redundant " x2" suffix where the seal is shown, and the modal
  spells out that the effects are applied twice.
- **Illustrated rules, continued**: every bad-event chapter now shows its own
  card illustration too (the Dragon *phase* keeps the original large artwork).

### Changed
- **The "whose turn" badge moved into the header.** It was duplicated above the
  actions rail, where it repeated what the header, the active arrow and the token
  aura already said. The header chip now carries the look: green with a pointing
  hand on your turn, neutral with an hourglass while you wait — and the rail
  gains a row.
- **The rail collapse arrows float on the first heading's line** ("Aventuriers",
  "Actions de base") instead of taking a row of their own, on desktop only. With
  the badge removed, the whole actions rail — Effort and Passer included — now
  fits a 900 px screen without scrolling.
- **"Finir le tour" is now "Passer"**, so it and Effort share the same fixed
  height side by side. The precise wording (finish the immediate action, pass
  while unconscious…) moved to the tooltip.
- **Action-point pips in the party cards are yellow again** and no longer repeat
  the number: counting the lightning bolts is enough. An adventurer with no
  points left simply shows none.
- **Roomy screens open with both rails expanded again.** The compact/detailed
  choice is now remembered *per layout*, so collapsing a rail on a phone no
  longer leaves the desktop stuck in compact mode; crossing the boundary
  (rotation, window resize) switches to that layout's own preference.
- **Action & ability buttons share one design**: the round icon button is now
  used everywhere, extended on desktop by a label plate welded to its right
  (rounded on the far side). The lightning pips move from under the icon to
  after the label, followed by "PA". Passive abilities use the very same pill
  with a dashed outline, so they line up with the active ones. Pills and section
  headings are kept tight so the whole actions rail still fits a 900 px screen.
- **Round adventurer portraits** in the left rail, in both compact and detailed
  cards. The compact card shows the face crop (much more readable in a small
  circle); the full illustration stays for the detailed card.
- **Character modal**: shows the full illustration and a real health bar (with
  the "3 / 3 PV" count under it) instead of a small portrait and a text count.

### Fixed
- **The hiding emoji is readable again**: `🫥` had crept back into the hide toast
  and journal lines, where Windows 10 draws it as a blank box. Back to `🙈`, as
  already decided in v2026.07.11.
- **The tile description pops next to the tile you clicked**, instead of being
  parked in the bottom-left corner of the screen — it flips above or beside the
  tile and is clamped to the viewport when there is no room below.
- **The guided tour now actually opens.** It waited for a board render that never
  came: no `game-state` is broadcast between "everyone is ready" and the first
  action, so the tour is started when the waiting overlay clears.
- **Landscape phones get the compact (two-column) rails again.** The layout was
  picked on width alone, so a 915×412 phone counted as a roomy desktop and got
  the detailed rails it has no room for. Height is now part of the test.
- **The service worker no longer serves stale CSS / JS on localhost**: its
  cache-first rule is bypassed on `localhost` / `127.0.0.1`, where it made edited
  stylesheets look broken until a hard reload.
- **Heal / damage animations are pinned to the token**, not to the middle of the
  tile: with two adventurers standing on the same tile, the feedback now pops
  over the right one.
- **Mobile: the side rails reach the bottom of the screen** instead of stopping
  under their last button.

### Tooling
- **`tools/devcheck.js` — automated in-browser check.** One command boots the
  server, drives a headless Chrome through the lobby into a real solo game (one
  player controlling four adventurers), walks the guided tour, then screenshots
  the desktop / mobile-portrait / mobile-landscape layouts and the character
  modal. It reports console errors, uncaught exceptions, failed requests,
  oversized images, horizontal overflow and controls that nothing can scroll to.
  No dependency: Chrome is driven over the DevTools Protocol with Node's own
  `fetch` and `WebSocket`. Screenshots land in `tools/.devcheck/` (gitignored).
  The three bugs fixed above were all found by this harness rather than by
  reading the diff.

## v2026.08.07

### Added
- **Board targeting instead of modals**: actions that used to ask for coordinates
  or a name in a dialog are now aimed directly on the board — the eligible cells
  / adventurers light up and a single click validates.
  - **Shadow Walk** (Hunter): candidate Gloom / Darkness tiles glow **purple**.
  - **Fireball** (Pyromancer): the walls that can be blasted open glow **orange**
    (sides already open are not offered).
  - **Heal / Balm / Inspiration**: eligible adventurers get a pulsing **green**
    halo on their token.
  - A banner recalls what is being aimed and offers a way out (also `Escape`).
- **Movement helper on the board**: while it is your turn, every tile you may
  step onto is outlined — **white** for a plain move, **orange** when it costs
  2 AP (suspended bridge, total darkness), **red** when entering may cost hit
  points (trap, poison, dragon, flames).
- **Hidden adventurers look hidden**: a successful *Se cacher* now fades the
  token on the board too (on top of the mask badge on the character card).
- **Hiding toasts**: a big central toast announces every attempt at hiding, with
  the dice roll — success as well as failure.
- **Sudden death toast**: the sudden-death announcement is followed by a toast
  listing who was devoured by the darkness and who resisted (with their rolls).
- **Slain Dragon animation**: a broken heart bursts over the tile when a Dragon
  is slain, mirroring the damage feedback on adventurers.
- **Game duration** is shown on the end-of-game screen.
- **Illustrated rules**: every adventurer chapter now shows the character's full
  illustration next to their abilities, and the Dragon bad-event chapter shows
  the Dragon. Illustrations float beside the text and are lazy-loaded, so the
  rules modal stays light until you scroll to them.

### Changed
- **Hiding lasts the whole round**: the *hidden* status is now cleared at the
  start of the next round instead of right after the Dragon phase, so it also
  protects during the Dragon phase **and** the bad-event phase that follows
  (including a Dragon event).
- **Mobile: the whole page scrolls.** Phone browsers keep an address bar and a
  system button bar that ate into the viewport, hiding the top of the screen and
  the "end turn" button with no way to reach them. On small screens the page now
  scrolls as a whole (with a sticky header), the board keeping a bounded slice of
  the viewport. The desktop layout is unchanged.
- **Landscape phones: two-column rails.** When the screen is wider than tall, the
  action / adventurer rails lay their round buttons out on two columns, which
  roughly halves their height and keeps the "end turn" button in view.

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
