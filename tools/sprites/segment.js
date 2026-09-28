// node segment.js : cut the hand-made sheets of static/assets/raws into
// work/src/<id>/<n>.png (one transparent figure per file, row by row), then add
// the frames kept in extra/<id>/ (poses the sheets lack, e.g. an AI-made
// standing side view), so that picks.json can use both.
const L = require('./lib');
const fs = require('fs'), path = require('path'), sharp = require('sharp');

const RAW = path.join(__dirname, '../../static/assets/raws');
const OUT = path.join(__dirname, 'work/src');
const EXTRA = path.join(__dirname, 'extra');
// Raw sheet -> the character on each of its rows (a single id: every row is it).
const SHEETS = {
    '1789575561477.png': ['shadow-hunter', 'gnome', 'dwarf', 'pyromancer'],
    '1789575565554.png': ['elf-rogue', 'druid', 'paladin', 'bard'],
    '1790595399316.png': ['dragon']
};

// Split boxes much wider than their row's median (two touching figures) at the
// emptiest column around their middle.
function splitWide(row, mask, w) {
    const ws = row.map(b => b.x1 - b.x0 + 1).sort((a, b) => a - b), med = ws[ws.length >> 1];
    const out = [];
    row.forEach(b => {
        const bw = b.x1 - b.x0 + 1;
        if (bw < med * 1.8) { out.push(b); return; }
        let best = -1, bestV = Infinity;
        for (let x = b.x0 + Math.round(bw * 0.35); x <= b.x0 + Math.round(bw * 0.65); x++) {
            let v = 0;
            for (let y = b.y0; y <= b.y1; y++) v += mask[y * w + x];
            if (v < bestV) { bestV = v; best = x; }
        }
        out.push({ ...b, x1: best - 1 }, { ...b, x0: best + 1 });
    });
    return out;
}

(async () => {
    fs.rmSync(OUT, { recursive: true, force: true });
    for (const [file, ids] of Object.entries(SHEETS)) {
        const img = await L.load(path.join(RAW, file));
        const mask = L.removeBg(img);
        const rows = L.rows(L.components(mask, img.w, img.h, 1500, 3)).map(r => splitWide(r, mask, img.w));
        for (let i = 0; i < rows.length; i++) {
            const id = ids.length === 1 ? ids[0] : ids[i];
            fs.mkdirSync(path.join(OUT, id), { recursive: true });
            for (let j = 0; j < rows[i].length; j++) {
                const name = (ids.length === 1 ? i + '_' : '') + j + '.png';
                const buf = await (await L.crop(img, rows[i][j])).png().toBuffer();
                await sharp(buf).trim({ threshold: 1 }).toFile(path.join(OUT, id, name));
            }
            console.log(id, rows[i].length, 'figures');
        }
    }
    if (fs.existsSync(EXTRA)) for (const id of fs.readdirSync(EXTRA)) {
        for (const f of fs.readdirSync(path.join(EXTRA, id))) fs.copyFileSync(path.join(EXTRA, id, f), path.join(OUT, id, f));
        console.log(id, '+ extra frames');
    }
})();
