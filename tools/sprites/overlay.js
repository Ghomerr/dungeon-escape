// node overlay.js : paste the items listed in overlays.json onto side-view frames
// (work/src/<id>/<frame>x.png), so that nothing held in the front view vanishes
// in profile. The item is the very same drawing, cut from the front frame.
const sharp = require('sharp'), path = require('path');
const CFG = require('./overlays.json');

async function cutItem(file, poly) {
    const m = await sharp(file).metadata();
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
    const x1 = Math.min(m.width, Math.max(...xs)), y1 = Math.min(m.height, Math.max(...ys));
    const pts = poly.map(p => (p[0] - x0) + ',' + (p[1] - y0)).join(' ');
    const mask = Buffer.from(`<svg width="${x1 - x0}" height="${y1 - y0}"><polygon points="${pts}" fill="#fff"/></svg>`);
    return sharp(file).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
        .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

(async () => {
    for (const [id, items] of Object.entries(CFG)) {
        if (id.startsWith('_')) continue;
        const dir = path.join(__dirname, 'work/src', id);
        const targets = {};   // frame -> list of pastes
        for (const it of items) {
            const cut = await cutItem(path.join(dir, it.from + '.png'), it.poly);
            const cm = await sharp(cut).metadata();
            const item = await sharp(cut).resize(Math.round(cm.width * it.sx), Math.round(cm.height * it.sy)).png().toBuffer();
            for (const [frame, [cx, cy]] of Object.entries(it.on)) (targets[frame] = targets[frame] || []).push({ item, cx, cy, under: it.under });
        }
        for (const [frame, pastes] of Object.entries(targets)) {
            const mirror = frame.endsWith('m'), base = frame.replace(/m$/, '');
            let fig = sharp(path.join(dir, base + '.png'));
            if (mirror) fig = fig.flop();
            fig = await fig.png().toBuffer();
            const fm = await sharp(fig).metadata();
            // Canvas padded so an item may stick out of the figure's box.
            const P = 40, W = fm.width + 2 * P, H = fm.height + 2 * P;
            const layer = async (p) => {
                const im = await sharp(p.item).metadata();
                return { input: p.item, left: Math.round(P + p.cx - im.width / 2), top: Math.round(P + p.cy - im.height / 2) };
            };
            const comps = [];
            for (const p of pastes.filter(p => p.under)) comps.push(await layer(p));
            comps.push({ input: fig, left: P, top: P });
            for (const p of pastes.filter(p => !p.under)) comps.push(await layer(p));
            const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite(comps).png().toBuffer();
            // A mirrored source is baked in: the output is already facing right.
            await sharp(out).trim({ threshold: 1 }).toFile(path.join(dir, base + (mirror ? 'm' : '') + 'x.png').replace(/mx\.png$/, 'rx.png'));
            console.log(id, frame, '->', base + (mirror ? 'rx' : 'x'));
        }
    }
})();
