// node contact.js : work/contact-<id>.png, every figure cut by segment.js with
// its file name, to choose the frames listed in picks.json.
const fs = require('fs'), path = require('path'), sharp = require('sharp');

const SRC = path.join(__dirname, 'work/src');

(async () => {
    for (const id of fs.readdirSync(SRC)) {
        const files = fs.readdirSync(path.join(SRC, id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const C = id === 'dragon' ? 320 : 120, H = 200, PER_ROW = 12;
        const comps = [];
        for (let i = 0; i < files.length; i++) {
            const buf = await sharp(path.join(SRC, id, files[i])).resize(C - 6, H - 26, { fit: 'inside' }).png().toBuffer();
            const x = (i % PER_ROW) * C, y = Math.floor(i / PER_ROW) * H;
            comps.push({ input: buf, left: x + 3, top: y + 22 });
            comps.push({ input: Buffer.from(`<svg width="${C}" height="20"><text x="4" y="16" font-size="16" font-family="Arial" fill="#c00">${files[i].replace('.png', '')}</text></svg>`), left: x, top: y });
        }
        const w = Math.min(PER_ROW, files.length) * C, h = Math.ceil(files.length / PER_ROW) * H;
        await sharp({ create: { width: w, height: h, channels: 4, background: '#ffffff' } })
            .composite(comps).png().toFile(path.join(__dirname, 'work', 'contact-' + id + '.png'));
        console.log('contact-' + id + '.png');
    }
})();
