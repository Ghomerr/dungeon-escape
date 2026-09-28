// Shared image helpers: background removal (flood fill from borders) and
// connected-component segmentation of a sprite sheet.
const sharp = require('sharp');

async function load(file) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
}

// Estimate background colour from the border pixels (median).
function bgColor(img) {
    const { data, w, h } = img;
    const rs = [], gs = [], bs = [];
    const push = (x, y) => { const i = (y * w + x) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); };
    for (let x = 0; x < w; x += 3) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y += 3) { push(0, y); push(w - 1, y); }
    const med = a => a.sort((p, q) => p - q)[a.length >> 1];
    return [med(rs), med(gs), med(bs)];
}

// Flood-fill from every border pixel through "background-like" pixels and
// make them transparent. Returns a mask (1 = foreground).
function removeBg(img, tol = 38, holeMin = 150) {
    const { data, w, h } = img;
    const bg = bgColor(img);
    const isBg = i => {
        const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
        return Math.sqrt(dr * dr + dg * dg + db * db) < tol;
    };
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
        const p = stack.pop();
        if (seen[p]) continue;
        if (!isBg(p * 4)) continue;
        seen[p] = 1;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
    }
    // Enclosed background pockets (between a wing and the tail, an arm and a
    // staff…): bg-like regions not reached from the border, removed when they
    // are large enough not to be a highlight inside the drawing.
    const strict = i => {
        const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
        return Math.sqrt(dr * dr + dg * dg + db * db) < 24;
    };
    const vis = new Uint8Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
        if (seen[p0] || vis[p0] || !strict(p0 * 4)) continue;
        const region = [], st = [p0]; vis[p0] = 1;
        while (st.length) {
            const p = st.pop(); region.push(p);
            const x = p % w, y = (p / w) | 0;
            const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
            nb.forEach(q => { if (q >= 0 && !seen[q] && !vis[q] && strict(q * 4)) { vis[q] = 1; st.push(q); } });
        }
        if (region.length >= holeMin) region.forEach(p => { seen[p] = 1; });
    }
    const mask = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
        if (seen[p]) data[p * 4 + 3] = 0; else mask[p] = 1;
    }
    // Soften the fringe: foreground pixels touching the background and close
    // to its colour get partial alpha.
    for (let p = 0; p < w * h; p++) {
        if (!mask[p]) continue;
        const x = p % w, y = (p / w) | 0;
        const edge = (x > 0 && !mask[p - 1]) || (x < w - 1 && !mask[p + 1]) || (y > 0 && !mask[p - w]) || (y < h - 1 && !mask[p + w]);
        if (edge) data[p * 4 + 3] = 150;
    }
    return mask;
}

// Connected components on the mask (8-connectivity) after a small dilation,
// returns bounding boxes sorted by row then column, dropping specks.
function components(mask, w, h, minArea = 400, dil = 4) {
    const grown = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        for (let dy = -dil; dy <= dil; dy++) for (let dx = -dil; dx <= dil; dx++) {
            const X = x + dx, Y = y + dy;
            if (X >= 0 && Y >= 0 && X < w && Y < h) grown[Y * w + X] = 1;
        }
    }
    const lab = new Int32Array(w * h);
    const boxes = [];
    let n = 0;
    for (let p = 0; p < w * h; p++) {
        if (!grown[p] || lab[p]) continue;
        n++;
        let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
        const st = [p]; lab[p] = n;
        while (st.length) {
            const q = st.pop();
            const x = q % w, y = (q / w) | 0;
            if (mask[q]) { area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const X = x + dx, Y = y + dy;
                if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
                const r = Y * w + X;
                if (grown[r] && !lab[r]) { lab[r] = n; st.push(r); }
            }
        }
        if (area >= minArea) boxes.push({ x0, y0, x1, y1, area, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
    return boxes;
}

// Group boxes into rows by vertical centre.
function rows(boxes) {
    boxes.sort((a, b) => a.cy - b.cy);
    const out = [];
    boxes.forEach(b => {
        const r = out.find(r => Math.abs(r.cy - b.cy) < (b.y1 - b.y0) * 0.45);
        if (r) { r.items.push(b); r.cy = r.items.reduce((s, i) => s + i.cy, 0) / r.items.length; } else out.push({ cy: b.cy, items: [b] });
    });
    out.forEach(r => r.items.sort((a, b) => a.cx - b.cx));
    return out.map(r => r.items);
}

async function crop(img, b, pad = 2) {
    const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad);
    const x1 = Math.min(img.w - 1, b.x1 + pad), y1 = Math.min(img.h - 1, b.y1 + pad);
    return sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
        .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
}

module.exports = { load, removeBg, components, rows, crop, bgColor };
