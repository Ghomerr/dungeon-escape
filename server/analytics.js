/* Anonymous game statistics sent to PostHog (EU cloud).

   Enabled only when the POSTHOG_KEY environment variable is set (on Render),
   so local / test games are never recorded. Events are sent fire-and-forget :
   an analytics outage must never disturb a game.
   No personal data : no player names, no room names. */
const crypto = require('crypto');
const Game = require('./game.js');

const KEY = process.env.POSTHOG_KEY || '';
const HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
const ENABLED = !!KEY && typeof fetch === 'function';

function capture(event, gameId, properties) {
    if (!ENABLED) return;
    fetch(HOST + '/i/v0/e/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: KEY,
            event,
            distinct_id: 'game-' + gameId,
            timestamp: new Date().toISOString(),
            properties: Object.assign({
                // Server-side events : no person profile, no GeoIP (it would be Render's location)
                $process_person_profile: false,
                $geoip_disable: true,
                app: 'dungeon-escape',
                game_id: gameId
            }, properties)
        })
    }).catch(() => { /* ignored on purpose */ });
}

// Same labels as the home page history (static/scripts/client.js)
const DIFF_LABEL = { easy: 'Facile', normal: 'Normal', advanced: 'Avancé', expert: 'Expert' };
const RANK_LABEL = { gold: 'Or', silver: 'Argent', bronze: 'Bronze' };

function setupProperties(room) {
    const g = room.game;
    return {
        difficulte: DIFF_LABEL[g.difficulty] || g.difficulty,
        joueurs: room.users.length,
        aventuriers: g.characters.length,
        personnages: g.characters.map(c => c.charId),
        potions_parchemins: !!g.itemsEnabled,
        danger_plus_3: !!room.extraEventsEnabled,
        tours_avant_mort_subite: g.eventsTotal
    };
}

function minutes(ms) {
    return ms != null ? Math.round(ms / 6000) / 10 : null;
}

/** Called once all players are ready and the game has been initialised. */
function gameStarted(room) {
    if (!room.game) return;
    room.game.analyticsId = crypto.randomUUID();
    capture('partie_lancee', room.game.analyticsId, setupProperties(room));
}

/** Called after every state change : reports the outcome once, when the game is over. */
function checkGameEnded(room) {
    const g = room.game;
    if (!g || !g.analyticsId || g.analyticsEndSent || g.status === Game.GAME_STATUS.PLAYING) return;
    g.analyticsEndSent = true;
    const s = g.endStats || {};
    capture('partie_terminee', g.analyticsId, Object.assign(setupProperties(room), {
        resultat: g.status === Game.GAME_STATUS.WON ? 'victoire' : 'defaite',
        rang: RANK_LABEL[g.rank] || null,
        sortis: s.escaped,
        survivants: g.characters.filter(c => !c.dead).length,
        abandonnes: s.abandoned,
        morts: s.dead,
        tours: s.turns,
        duree_min: minutes(s.durationMs),
        tuiles_restantes: g.deck ? g.deck.length : null
    }));
}

/** Called when a running game is closed before its end (host ended it, or players never came back). */
function gameAborted(room, reason) {
    const g = room.game;
    if (!g || !g.analyticsId || g.analyticsEndSent || g.status !== Game.GAME_STATUS.PLAYING) return;
    g.analyticsEndSent = true;
    capture('partie_abandonnee', g.analyticsId, Object.assign(setupProperties(room), {
        raison: reason,
        tours: g.round,
        duree_min: minutes(g.startedAt ? Date.now() - g.startedAt : null)
    }));
}

/** Browser-side snippet for the home page (served as /analytics.js) : visits and location, cookieless. */
function clientScript() {
    if (!KEY) return '/* analytics disabled */';
    return '!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);\n' +
        'posthog.init(' + JSON.stringify(KEY) + ', {' +
        ' api_host: ' + JSON.stringify(HOST) + ',' +
        ' cookieless_mode: "always",' +
        ' person_profiles: "identified_only",' +
        ' autocapture: false,' +
        ' disable_session_recording: true' +
        ' });\n' +
        'posthog.register({ app: "dungeon-escape" });\n';
}

module.exports = { ENABLED, gameStarted, checkGameEnded, gameAborted, clientScript };
