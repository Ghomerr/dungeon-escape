# Dungeon Escape

## Presentation

"Dungeon Escape" is a collaborative survival game for up to 6 players. It's based on the board game [Sub Terra](https://www.philibertnet.com/fr/nuts-publishing/75241-sub-terra-3770009354059.html), but with a Dungeon & Dragons theme.

Each player takes on the role of a character from the Dungeons & Dragons universe. During their adventure, they will explore a network of rooms and corridors typical of Dungeons & Dragons games.

Together, the players must find the exit before the Dungeon's curse falls upon them and they are devoured by darkness forever. Players must work as a team to quickly explore the dungeon and avoid a series of increasingly deadly traps. And worse, avoid at all costs the dragons that lurk within...

## Run the local web version

* `npm install` — install dependencies (Express + Socket.IO)
* `npm run dev` — start the local Node server (auto-reload via nodemon)
* `npm start` — start the server without auto-reload
* Open `http://localhost:8182/` in your browser

Open the page in several tabs/browsers to simulate several players: one player
creates a room, the others join it, everyone picks a character (4 to 6
characters total), the owner chooses a difficulty and launches the game.

## Architecture

Mirrors the sibling `skull-king` project:

* `server.js` — Express + Socket.IO entry point, room / lobby / game wiring
* `server/` — game logic
  * `tiles.js` — the 64 dungeon tiles, grid geometry and tile orientation
  * `characters.js` — the 8 adventurers and their abilities
  * `events.js` — the misfortune cards and the difficulty table
  * `game.js` — the game engine (setup, actions, dragons, events, win/loss)
  * `utils.js` — ids, shuffle, talent rolls and BFS pathfinding
* `static/` — vanilla JS + jQuery front-end
  * `main.html` / `scripts/client.js` — home, rooms list and waiting room
  * `game.html` / `scripts/client-game.js` — the in-game board and controls

### Known simplifications (first local version)

* Tiles are auto-oriented to connect back to the tile being explored from
  (the rules allow a manual rotation choice).
* The board is a square grid (North / East / South / West connections).
* A player may control several characters only when fewer than 4 humans are
  connected; with 4+ players it is one character each.
