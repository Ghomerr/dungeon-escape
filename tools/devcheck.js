/**
 * Dungeon Escape — automated visual / runtime check.
 *
 * Boots the game server (unless one already listens), drives a headless Chrome
 * through the lobby into a real solo game (one player controlling 4 adventurers),
 * then screenshots the result at several viewports and reports every console
 * error, page exception and failed request seen along the way.
 *
 * Zero dependencies: Chrome is driven over the DevTools Protocol using Node's
 * built-in `fetch` and global `WebSocket` (Node >= 22).
 *
 *   node tools/devcheck.js [--keep] [--out DIR] [--url URL] [--tutorial|--no-tutorial]
 *
 *   --keep            leave the server running on exit (it was started here)
 *   --out DIR         screenshot directory (default: tools/.devcheck)
 *   --url URL         target a running instance instead of booting one
 *   --no-tutorial     dismiss the guided tour before shooting the board
 *   --shot NAME=SEL   extra screenshot of one element (repeatable)
 *
 * Exit code 1 if any console error / exception / failed request was captured.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8182;
const CDP_PORT = 9333;                 // not 9222: never fight the user's own Chrome
const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const argVal = (f, dflt) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : dflt; };

const OUT = path.resolve(ROOT, argVal('--out', 'tools/.devcheck'));
const BASE = argVal('--url', 'http://localhost:' + PORT);
const SKIP_TUTORIAL = hasFlag('--no-tutorial');

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

// Viewports worth checking: the three layouts the CSS actually branches on.
const VIEWPORTS = [
    { name: 'desktop', width: 1600, height: 900, mobile: false },
    { name: 'mobile-portrait', width: 412, height: 915, mobile: true },
    { name: 'mobile-landscape', width: 915, height: 412, mobile: true }
];

const problems = [];
const log = (...m) => console.log(...m);

// --- tiny CDP client --------------------------------------------------------

class Cdp {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }

    static async attach(wsUrl) {
        const ws = new WebSocket(wsUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
        const cdp = new Cdp(ws);
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && cdp.pending.has(msg.id)) {
                const { resolve, reject } = cdp.pending.get(msg.id);
                cdp.pending.delete(msg.id);
                msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
            } else if (msg.method) {
                (cdp.handlers.get(msg.method) || []).forEach(h => h(msg.params));
            }
        };
        return cdp;
    }

    send(method, params) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            setTimeout(() => {
                if (this.pending.delete(id)) reject(new Error('CDP timeout on ' + method));
            }, 30000);
        });
    }

    on(method, fn) {
        if (!this.handlers.has(method)) this.handlers.set(method, []);
        this.handlers.get(method).push(fn);
    }

    /** Evaluate an expression in the page and return its (awaited) value. */
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', {
            expression: expr, awaitPromise: true, returnByValue: true
        });
        if (r.exceptionDetails) throw new Error('page eval: ' + (r.exceptionDetails.exception || {}).description);
        return r.result.value;
    }

    /** Poll an expression until it is truthy (or fail). */
    async waitFor(expr, label, timeout = 20000) {
        const t0 = Date.now();
        for (;;) {
            let ok = false;
            try { ok = await this.eval('!!(' + expr + ')'); } catch (e) { /* mid-navigation */ }
            if (ok) return;
            if (Date.now() - t0 > timeout) throw new Error('timeout waiting for ' + (label || expr));
            await sleep(200);
        }
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function portBusy(port) {
    return new Promise(resolve => {
        const s = net.createConnection({ port, host: '127.0.0.1' });
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('error', () => resolve(false));
    });
}

async function waitPort(port, timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        if (await portBusy(port)) return true;
        await sleep(200);
    }
    return false;
}

// --- boot ------------------------------------------------------------------

async function startServer() {
    if (await portBusy(PORT)) { log('· server already listening on ' + PORT); return null; }
    const node = process.execPath;
    const srv = spawn(node, ['server.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    srv.stdout.on('data', d => process.stdout.write('  [server] ' + d));
    srv.stderr.on('data', d => process.stderr.write('  [server!] ' + d));
    if (!await waitPort(PORT)) throw new Error('server did not start on ' + PORT);
    log('· server started on ' + PORT);
    return srv;
}

async function startChrome() {
    const exe = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!exe) throw new Error('Chrome not found. Set CHROME_PATH.');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'de-devcheck-'));
    const chrome = spawn(exe, [
        '--headless=new',
        '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profile,          // fresh profile: no stale service-worker cache
        '--no-first-run', '--no-default-browser-check',
        '--disable-features=Translate,MediaRouter',
        '--hide-scrollbars', '--mute-audio',
        '--window-size=1600,900',
        'about:blank'
    ], { stdio: 'ignore' });
    if (!await waitPort(CDP_PORT)) throw new Error('Chrome did not expose the debugging port');
    log('· headless Chrome up (' + path.basename(exe) + ')');
    return { chrome, profile };
}

async function firstPageTarget() {
    for (let i = 0; i < 25; i++) {
        const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
        const page = list.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        await sleep(200);
    }
    throw new Error('no page target');
}

// --- instrumentation --------------------------------------------------------

function watchProblems(cdp) {
    cdp.on('Runtime.consoleAPICalled', (p) => {
        if (p.type !== 'error' && p.type !== 'warning') return;
        const text = (p.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
        // The audio autoplay refusal is expected in headless (no user gesture).
        if (/play\(\) failed|autoplay/i.test(text)) return;
        problems.push({ kind: 'console.' + p.type, text });
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
        const d = p.exceptionDetails || {};
        problems.push({ kind: 'exception', text: (d.exception && d.exception.description) || d.text });
    });
    cdp.on('Network.loadingFailed', (p) => {
        if (p.type === 'Image' || p.type === 'Stylesheet' || p.type === 'Script' || p.type === 'Document') {
            problems.push({ kind: 'request-failed', text: p.type + ' — ' + p.errorText });
        }
    });
    cdp.on('Network.responseReceived', (p) => {
        const r = p.response || {};
        if (r.status >= 400) problems.push({ kind: 'http-' + r.status, text: r.url });
    });
}

async function setViewport(cdp, vp) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: !!vp.mobile
    });
    await sleep(350);   // let the CSS breakpoints and the JS resize handler settle
}

async function shoot(cdp, name) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, name + '.png');
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    log('  → ' + path.relative(ROOT, file));
    return file;
}

// --- the actual scenario ----------------------------------------------------

async function run() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    const srv = await startServer();
    const { chrome, profile } = await startChrome();
    let cdp;
    try {
        cdp = await Cdp.attach(await firstPageTarget());
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Network.enable');
        watchProblems(cdp);

        await setViewport(cdp, VIEWPORTS[0]);

        // --- lobby -----------------------------------------------------------
        log('· lobby');
        await cdp.send('Page.navigate', { url: BASE + '/' });
        await cdp.waitFor("document.querySelector('#lobby-btn')", 'lobby form');
        await sleep(400);
        const room = 'DEVCHK' + Math.floor(Math.random() * 900 + 100);
        await cdp.eval(`
            (() => {
                $('#user-id').val('DevCheck').trigger('change');
                $('#room-id').val('${room}').trigger('change');
                $('#lobby-btn').click();
                return true;
            })()`);
        await cdp.waitFor("$('#waiting-room').is(':visible')", 'waiting room');
        await sleep(500);
        await shoot(cdp, '01-waiting-room');

        // A single human may control several adventurers, so one player is enough.
        log('· picking 4 adventurers');
        await cdp.eval(`
            (() => {
                const cards = $('#wr-character-grid .char-card').not('.taken').slice(0, 4);
                cards.each((_i, el) => el.click());
                return cards.length;
            })()`);
        await cdp.waitFor("$('#wr-character-grid .char-card.mine').length === 4", '4 characters selected');
        await cdp.waitFor("!$('#start-btn').prop('disabled')", 'start button enabled');
        await shoot(cdp, '02-characters-selected');

        // --- game ------------------------------------------------------------
        log('· starting the game');
        await cdp.eval("$('#start-btn').click(), true");
        await cdp.waitFor("document.querySelector('#board .tile')", 'board rendered', 25000);
        await cdp.waitFor("$('#waiting-overlay').is(':hidden')", 'waiting overlay gone', 25000);

        // The tour must open on its own on a fresh profile (opt-in ticked by
        // default): waiting for it IS the test.
        let tutorialUp = true;
        try {
            await cdp.waitFor("$('#tutorial').is(':visible')", 'guided tour', 8000);
        } catch (e) {
            tutorialUp = false;
            problems.push({ kind: 'tutorial', text: 'the guided tour did not open on its own (fresh profile)' });
        }
        if (tutorialUp) {
            await sleep(400);
            await shoot(cdp, '03-tutorial-step1');
            // Walk a few steps so the spotlight logic is exercised on real targets.
            for (const i of [1, 2, 3]) {
                await cdp.eval("$('#tuto-next').click(), true");
                await sleep(500);
                await shoot(cdp, '03-tutorial-step' + (i + 1));
            }
        }
        // Always leave the tour closed: it would sit on top of the layout shots.
        await cdp.eval("if (typeof endTutorial === 'function') endTutorial(); true");
        await sleep(300);

        // --- layouts ---------------------------------------------------------
        for (const vp of VIEWPORTS) {
            log('· ' + vp.name + ' (' + vp.width + 'x' + vp.height + ')');
            await setViewport(cdp, vp);
            await cdp.eval("if (window.Game && Game.state) render(Game.state); true");
            await sleep(400);
            await shoot(cdp, '10-game-' + vp.name);
            // Reachability: how far below the fold the key controls sit, and
            // whether the page can actually be scrolled down to them.
            const reach = await cdp.eval(`
                (() => {
                    const el = document.querySelector('#endturn-btn');
                    if (!el) return null;
                    // Off-screen is fine as long as SOMETHING can scroll to it:
                    // the page itself, or any scrollable ancestor (the rails).
                    let scrollable = document.documentElement.scrollHeight > window.innerHeight + 2;
                    for (let p = el.parentElement; p && !scrollable; p = p.parentElement) {
                        const oy = getComputedStyle(p).overflowY;
                        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 2) scrollable = true;
                    }
                    return { bottom: Math.round(el.getBoundingClientRect().bottom), vh: window.innerHeight, scrollable };
                })()`);
            if (reach) {
                const hidden = reach.bottom > reach.vh;
                log('  · end-turn bottom=' + reach.bottom + ' / vh=' + reach.vh +
                    (hidden ? (reach.scrollable ? ' (below the fold, scrollable ✔)' : ' (UNREACHABLE)') : ' (visible)'));
                if (hidden && !reach.scrollable) {
                    problems.push({ kind: 'layout', text: vp.name + ': "Finir le tour" is off-screen and nothing scrolls to it' });
                }
            }
        }

        // A couple of modals, at desktop size.
        await setViewport(cdp, VIEWPORTS[0]);
        await cdp.eval("$('#party-list .party-card').first().click(), true");
        await sleep(400);
        await shoot(cdp, '20-character-modal');
        await cdp.eval("$('#char-dialog').dialog('close'), true");

        // Tile description: opened by RIGHT-CLICK (or long press on touch), never
        // by a plain click — a left click is how you walk onto the tile. It must
        // land next to the tile that was inspected.
        await cdp.eval("$('#board .tile').not('.ghost-cell').first().trigger('contextmenu'), true");
        await sleep(400);
        await shoot(cdp, '21-tile-desc');
        const desc = await cdp.eval(`
            (() => {
                const p = document.querySelector('#tile-desc');
                const t = document.querySelector('#board .tile:not(.ghost-cell)');
                if (!p || !t || p.style.display === 'none') return null;
                const a = p.getBoundingClientRect(), b = t.getBoundingClientRect();
                return { dx: Math.round(Math.abs((a.left + a.width/2) - (b.left + b.width/2))),
                         dy: Math.round(Math.abs((a.top + a.height/2) - (b.top + b.height/2))) };
            })()`);
        if (desc) {
            log('  · tile popup offset from the tile: dx=' + desc.dx + ' dy=' + desc.dy);
            if (desc.dx > 300 || desc.dy > 300) {
                problems.push({ kind: 'layout', text: 'the tile description is far from the clicked tile (dx=' + desc.dx + ', dy=' + desc.dy + ')' });
            }
        } else {
            problems.push({ kind: 'layout', text: 'right-clicking a tile showed no description panel' });
        }
        // ...and a plain left click must NOT open it (it would cover the tile the
        // adventurer is about to step onto).
        await cdp.eval("$('#tile-desc').hide(); $('#board .tile').not('.ghost-cell').first().click(), true");
        await sleep(300);
        const leftOpened = await cdp.eval(
            "(() => { const p = document.querySelector('#tile-desc'); return !!p && p.style.display !== 'none'; })()");
        if (leftOpened) {
            problems.push({ kind: 'layout', text: 'a plain left click still opens the tile description panel' });
        }

        // Placement modal: once a tile is drawn it MUST be placed — no Cancel —
        // and it has to say what the tile does, since the choice is final.
        await cdp.eval("sendAction('discover', { dir: 0 }), true");
        await sleep(600);
        await shoot(cdp, '24-placement-modal');
        const place = await cdp.eval(`
            (() => {
                const d = document.querySelector('#placement-dialog');
                if (!d || !d.offsetParent) return null;
                const box = d.closest('.ui-dialog') || d.parentElement;
                const btns = [...box.querySelectorAll('.ui-dialog-buttonpane button')].map(b => b.textContent.trim());
                const closeBtn = box.querySelector('.ui-dialog-titlebar-close');
                return {
                    buttons: btns,
                    closeVisible: !!(closeBtn && closeBtn.offsetParent),
                    descs: d.querySelectorAll('.cand-desc').length,
                    orients: d.querySelectorAll('.orient-btn').length
                };
            })()`);
        if (!place) {
            log('  · placement modal auto-resolved (single orientation) — nothing to check');
        } else {
            log('  · placement modal: buttons=' + JSON.stringify(place.buttons) +
                ' close=' + place.closeVisible + ' desc=' + place.descs + ' orient=' + place.orients);
            if (place.buttons.some(b => /annuler/i.test(b))) {
                problems.push({ kind: 'rules', text: 'the placement modal still offers "Annuler" (a drawn tile must be placed)' });
            }
            if (place.closeVisible) {
                problems.push({ kind: 'rules', text: 'the placement modal can still be closed without placing the tile' });
            }
            if (!place.descs) {
                problems.push({ kind: 'layout', text: 'the placement modal shows no tile description' });
            }
            await cdp.eval("$('#placement-dialog .orient-btn').first().click(), true");
            await sleep(400);
        }

        // "Somebody else's turn" is unreachable in a solo run, so force it: the
        // header badge must drop the green and switch to the hourglass.
        await cdp.eval("window.__myTurn = isMyTurn; isMyTurn = () => false; render(Game.state); true");
        await sleep(300);
        await shoot(cdp, '23-not-your-turn');
        const notMine = await cdp.eval(`
            (() => { const t = document.querySelector('#turn-info');
                return { green: t.classList.contains('your-turn'),
                         icon: (t.querySelector('.ti-ico') || {}).className || '' }; })()`);
        if (notMine.green || !/hourglass/.test(notMine.icon)) {
            problems.push({ kind: 'header', text: 'waiting state shows ' + JSON.stringify(notMine) });
        }
        await cdp.eval("isMyTurn = window.__myTurn; render(Game.state); true");
        await sleep(300);

        // Trigger a real "Se cacher" (2 AP, the active adventurer starts with 2):
        // exercises the fx queue and shows whether its emoji renders on this OS.
        await cdp.eval(`
            (() => {
                const b = [...document.querySelectorAll('#dungeon-actions button')]
                    .find(el => /cacher/i.test(el.getAttribute('title') || ''));
                if (b && !b.disabled) b.click();
                return !!b;
            })()`);
        await sleep(900);
        await shoot(cdp, '22-hide-toast');

        // Two states the engine can reach but a scripted solo run cannot reliably
        // produce, so drive the renderer directly and restore afterwards.
        //  (a) Shadow Hunter gone into the shadows: reappearing must REPLACE every
        //      other action, not sit among them.
        const shadowUi = await cdp.eval(`
            (() => {
                const ac = Game.state.characters.find(c => c.id === Game.state.activeId);
                if (!ac) return null;
                ac.shadowOut = true; render(Game.state);
                const abil = [...document.querySelectorAll('#ability-actions button')].map(b => b.textContent.trim());
                const out = {
                    abilities: abil,
                    base: document.querySelectorAll('#base-actions button').length,
                    dungeon: document.querySelectorAll('#dungeon-actions button').length
                };
                ac.shadowOut = false; render(Game.state);
                return out;
            })()`);
        if (shadowUi) {
            log('  · shadow-out UI: ' + JSON.stringify(shadowUi));
            if (shadowUi.base || shadowUi.dungeon) {
                problems.push({ kind: 'rules', text: 'an adventurer in the shadows still shows normal actions' });
            }
            if (!shadowUi.abilities.some(t => /r.appara/i.test(t))) {
                problems.push({ kind: 'rules', text: 'no "Réapparaître" button while in the shadows' });
            }
        }
        //  (b) An adventurer standing on the Exit stays ON the board (still in
        //      play), flagged as safe.
        const exitUi = await cdp.eval(`
            (() => {
                const ac = Game.state.characters.find(c => c.id === Game.state.activeId);
                if (!ac) return null;
                ac.escaped = true; render(Game.state);
                const tok = document.querySelector('.char-token[data-cid="' + ac.id + '"]');
                const out = { onBoard: !!tok, safe: !!(tok && tok.classList.contains('tok-safe')) };
                ac.escaped = false; render(Game.state);
                return out;
            })()`);
        if (exitUi) {
            log('  · on-exit UI: ' + JSON.stringify(exitUi));
            if (!exitUi.onBoard) {
                problems.push({ kind: 'rules', text: 'an adventurer on the Exit tile has no token on the board' });
            }
            if (!exitUi.safe) {
                problems.push({ kind: 'layout', text: 'an adventurer on the Exit tile is not marked as safe' });
            }
        }

        // Extra element shots requested on the command line (--shot name=selector).
        for (let i = 0; i < args.length; i++) {
            if (args[i] !== '--shot') continue;
            const [name, sel] = String(args[i + 1] || '').split('=');
            if (!name || !sel) continue;
            await cdp.eval(`(document.querySelector(${JSON.stringify(sel)}) || {}).scrollIntoView?.({block:'center'}); true`);
            await sleep(250);
            await shoot(cdp, '30-' + name);
        }

        // Sanity probes: things a screenshot alone would not tell us.
        const probe = await cdp.eval(`
            (() => {
                const img = document.querySelector('.tuto-optin-dragon');
                const out = { cssLoaded: [...document.styleSheets].some(s => (s.href || '').includes('main.css')) };
                if (img) out.optinDragon = img.getBoundingClientRect().width;
                out.oversized = [...document.querySelectorAll('img')]
                    .filter(el => el.getBoundingClientRect().width > 520)
                    .map(el => el.className + ' @' + Math.round(el.getBoundingClientRect().width) + 'px');
                out.overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
                return out;
            })()`);
        if (probe.oversized && probe.oversized.length) {
            problems.push({ kind: 'layout', text: 'oversized image(s): ' + probe.oversized.join(', ') });
        }
        if (probe.overflowX) problems.push({ kind: 'layout', text: 'the page scrolls horizontally' });
        log('· probes: ' + JSON.stringify(probe));

    } finally {
        try { if (cdp) cdp.ws.close(); } catch (e) { /* ignore */ }
        chrome.kill();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked on Windows */ }
        if (srv && !hasFlag('--keep')) srv.kill();
    }

    log('\n=== result ===');
    if (!problems.length) { log('no console error, no exception, no failed request.'); return 0; }
    problems.forEach(p => log('  [' + p.kind + '] ' + p.text));
    return 1;
}

run().then(code => process.exit(code)).catch(err => {
    console.error('devcheck failed: ' + err.message);
    process.exit(2);
});
