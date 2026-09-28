// node generate.js <id|all> [model] : ask Eden AI for a clean walk-cycle sheet
// of one character, using its row of hand-made sprites as the reference, then
// slice the answer into work/gen/<id>/{d,u,r}{0,1,2}.png for build.js.
//   d = facing down, u = facing up, r = facing right ("left" is its mirror)
//   0 = idle, 1 = step A, 2 = step B
// The API key is read from EDEN_API_KEY, never from a file in the repo.
const L = require('./lib');
const fs = require('fs'), path = require('path'), sharp = require('sharp');

const KEY = process.env.EDEN_API_KEY;
const RAW = path.join(__dirname, '../../static/assets/raws');
const WORK = path.join(__dirname, 'work/gen');
const DEFAULT_MODEL = 'google/gemini-3.1-flash-image';

// Raw sheet, row of the character in it (null: whole sheet), description.
const CHARS = {
    'shadow-hunter': ['1789575561477.png', 0, 'a hooded shadow hunter in a dark grey tattered cloak and leather armor, holding a small skull in one hand and a curved dagger in the other'],
    'gnome': ['1789575561477.png', 1, 'an old bearded gnome with a pointed brown hood, a brown leather vest over a green patched tunic, holding a fan of playing cards'],
    'dwarf': ['1789575561477.png', 2, 'a dwarf with a long braided grey beard, chainmail and steel pauldrons, a brown leather tunic, holding a hammer in one hand and an open book in the other'],
    'pyromancer': ['1789575561477.png', 3, 'a pyromancer with spiky orange hair in a long red-brown robe with a burning hem, a flame floating above each open palm'],
    'elf-rogue': ['1789575565554.png', 0, 'a blond elf rogue in green leather armor with a bow and quiver on the back, holding a ring of keys'],
    'druid': ['1789575565554.png', 1, 'an old druid woman with long grey hair and a leaf crown, a brown hooded robe, holding a wooden staff topped with a glowing green crystal'],
    'paladin': ['1789575565554.png', 2, 'a blond paladin in full silver plate armor with a golden sun emblem on the chest, a golden sun shield on one arm and a mace in the other hand'],
    'bard': ['1789575565554.png', 3, 'a bard in a purple and magenta striped doublet and puffy trousers, a purple beret with a feather, brown boots and a leather satchel, playing a lute'],
    'dragon': ['1790595399316.png', null, 'a red dragon with large bat wings, orange belly scales, horns and a long tail']
};

function prompt(id, desc) {
    const cycle = id === 'dragon'
        ? 'a four-legged walk cycle (legs alternate, wings folded against the body)'
        : 'a walk cycle';
    return `The reference image shows the character "${desc}" drawn in a detailed hand-inked fantasy illustration style on a plain parchment background.
Create a clean game SPRITE SHEET of EXACTLY this same character, as ${cycle}, laid out as a strict grid of 3 columns x 3 rows, 9 full-body figures in total, all the same size, evenly spaced, not touching each other, on a perfectly flat plain parchment background (#F2E4BF) with no shadows, no ground, no text, no labels, no borders, no grid lines.
Row 1: the character facing DOWN toward the viewer (front view).
Row 2: the character facing UP away from the viewer (back view).
Row 3: the character facing RIGHT (side profile view, walking toward the right edge of the image).
Column 1: standing still, feet together (idle).
Column 2: walking, left leg stepping forward.
Column 3: walking, right leg stepping forward.
The character must be strictly IDENTICAL in every frame: same colors, same outfit, same proportions, same items held in the same hands, same art style as the reference. Only the legs (and a slight arm swing) change between columns.`;
}

async function reference(sheet, row) {
    const file = path.join(RAW, sheet);
    if (row === null) return sharp(file).png().toBuffer();
    const m = await sharp(file).metadata(), band = m.height / 4;
    return sharp(file).extract({ left: 0, top: Math.round(row * band), width: m.width, height: Math.round(band) }).png().toBuffer();
}

// Slice a generated 3x3 sheet; returns false when it is not a clean 3x3 grid.
async function slice(id, file) {
    const img = await L.load(file);
    const mask = L.removeBg(img);
    const rows = L.rows(L.components(mask, img.w, img.h, 800, 3));
    if (rows.length !== 3 || rows.some(r => r.length !== 3)) {
        console.warn(`  ${id}: expected a 3x3 grid, found rows of ${rows.map(r => r.length).join('/')} — check ${file}`);
        return false;
    }
    const dir = path.join(WORK, id);
    fs.mkdirSync(dir, { recursive: true });
    const names = ['d', 'u', 'r'];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const buf = await (await L.crop(img, rows[i][j])).png().toBuffer();
        await sharp(buf).trim({ threshold: 1 }).toFile(path.join(dir, names[i] + j + '.png'));
    }
    return true;
}

async function generate(id, model) {
    const [sheet, row, desc] = CHARS[id];
    const ref = await reference(sheet, row);
    const body = {
        model, prompt: prompt(id, desc), n: 1, size: '1024x1024',
        images: [{ image_url: 'data:image/png;base64,' + ref.toString('base64') }]
    };
    const t0 = Date.now();
    const res = await fetch('https://api.edenai.run/v3/images/edits', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.data || !json.data[0]) throw new Error(res.status + ' ' + JSON.stringify(json).slice(0, 400));
    const d = json.data[0];
    const buf = d.b64_json ? Buffer.from(d.b64_json, 'base64') : Buffer.from(await (await fetch(d.url)).arrayBuffer());
    fs.mkdirSync(WORK, { recursive: true });
    const file = path.join(WORK, id + '-sheet.png');
    fs.writeFileSync(file, buf);
    console.log(`${id}: ok in ${((Date.now() - t0) / 1000).toFixed(0)}s, cost ${json.cost}`);
    await slice(id, file);
}

(async () => {
    if (!KEY) { console.error('Set EDEN_API_KEY first.'); process.exit(2); }
    const [target, model = DEFAULT_MODEL] = process.argv.slice(2);
    const ids = target === 'all' ? Object.keys(CHARS) : [target];
    if (!ids.every(id => CHARS[id])) { console.error('usage: node generate.js <' + Object.keys(CHARS).join('|') + '|all> [model]'); process.exit(2); }
    let failed = 0;
    for (const id of ids) {
        try { await generate(id, model); } catch (e) { failed++; console.error(id + ': ' + e.message); }
    }
    process.exit(failed ? 1 : 0);
})();
