// node build.js [id...] : assemble static/assets/sprites/<id>.png.
// Layout: 3 columns (idle, step A, step B) x 4 rows (down, left, right, up) of
// CELL x CELL frames, figures bottom-aligned; "left" is the mirror of "right".
// Frames come from work/gen/<id>/ (generate.js) when all 9 are there, else from
// the hand-made sheets cut by segment.js (work/src/<id>/), picked by picks.json
// ("Nm" = frame N mirrored, for side views drawn facing left; "N+L" / "N+R" =
// frame N with its left / right foot lifted, the "light" walk used for the
// front and back views: the very same drawing, so nothing can change in it).
const fs = require('fs'), path = require('path'), sharp = require('sharp');

const OUT = path.join(__dirname, '../../static/assets/sprites');
const GEN = path.join(__dirname, 'work/gen');
const SRC = path.join(__dirname, 'work/src');
const PICKS = require('./picks.json');
const CELL = 128;
const GEN_PICKS = { down: ['d0', 'd1', 'd2'], up: ['u0', 'u1', 'u2'], right: ['r0', 'r1', 'r2'] };

function source(id) {
    const g = path.join(GEN, id);
    const all = Object.values(GEN_PICKS).flat();
    if (all.every(n => fs.existsSync(path.join(g, n + '.png')))) return { dir: g, picks: GEN_PICKS, from: 'generated' };
    return { dir: path.join(SRC, id), picks: PICKS[id], from: 'hand-made' };
}

// Lift one foot, as a continuous warp (no cut, so no seam even on a long robe):
// below LEGS of the height, the side of the lifted foot is squeezed upward so
// its bottom rises by LIFT of the height, fading smoothly across the middle;
// above the feet the figure sways by SWAY of its width toward the planted
// foot, fading to nothing at the ground.
const LEGS = 0.72, LIFT = 0.07, SWAY = 0.025;
async function liftFoot(buf, side) {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const out = Buffer.alloc(data.length);
    const split = h * LEGS, lift = h * LIFT, sway = w * SWAY * (side === 'L' ? 1 : -1);
    const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    // 1 on the lifted foot's side, 0 on the planted one, blended over the middle 20%.
    const weight = x => { const t = smooth((x / w - 0.4) / 0.2); return side === 'L' ? 1 - t : t; };
    for (let y = 0; y < h; y++) {
        const g = y < split ? 0 : (y - split) / (h - split);         // 0 at the hips, 1 at the ground
        const dx = sway * (1 - smooth(g));
        for (let x = 0; x < w; x++) {
            const sx = Math.round(x - dx);
            // Output row y samples source row y + lift*g*weight: the foot comes up.
            const sy = Math.round(y + lift * g * weight(sx));
            if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
            data.copy(out, (y * w + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
        }
    }
    return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function frame(dir, name) {
    const [, base, mirror, foot] = name.match(/^([^m+]+)(m?)(?:\+([LR]))?$/);
    let img = sharp(path.join(dir, base + '.png'));
    if (mirror) img = img.flop();
    let buf = await img.png().toBuffer();
    if (foot) buf = await liftFoot(buf, foot);
    return sharp(buf).resize(CELL - 6, CELL - 4, { fit: 'inside' }).png().toBuffer();
}

async function place(buf, col, row, flip) {
    const b = flip ? await sharp(buf).flop().png().toBuffer() : buf;
    const m = await sharp(b).metadata();
    return { input: b, left: col * CELL + Math.round((CELL - m.width) / 2), top: row * CELL + (CELL - 2 - m.height) };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PICKS);
    for (const id of ids) {
        const { dir, picks, from } = source(id);
        const comps = [];
        for (const [dirName, row] of [['down', 0], ['right', 2], ['up', 3]]) {
            for (let c = 0; c < 3; c++) {
                const buf = await frame(dir, picks[dirName][c]);
                comps.push(await place(buf, c, row, false));
                if (dirName === 'right') comps.push(await place(buf, c, 1, true));
            }
        }
        await sharp({ create: { width: CELL * 3, height: CELL * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite(comps).png({ compressionLevel: 9, palette: true, quality: 90 })
            .toFile(path.join(OUT, id + '.png'));
        console.log(id + ': ' + from + ' frames');
    }
})();
