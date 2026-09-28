// node grid.js <id> <frame...> : work/grid-<id>.png, frames x3 with a 10px grid (labels every 20px).
const sharp = require('sharp'), path = require('path');
const [id, ...frames] = process.argv.slice(2), Z = 3;
(async () => {
  const comps = []; let x = 0, H = 0;
  for (const f of frames) {
    const m = await sharp(path.join('work/src', id, f + '.png')).metadata();
    const w = m.width * Z, h = m.height * Z;
    const img = await sharp(path.join('work/src', id, f + '.png')).resize(w, h, { kernel: 'nearest' }).png().toBuffer();
    let svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
    for (let i = 0; i <= m.width; i += 10) svg += `<line x1="${i*Z}" y1="0" x2="${i*Z}" y2="${h}" stroke="${i%50?'#0af':'#f00'}" stroke-width="1" opacity=".5"/>` + (i % 20 ? '' : `<text x="${i*Z+2}" y="12" font-size="11" fill="#f00">${i}</text>`);
    for (let j = 0; j <= m.height; j += 10) svg += `<line x1="0" y1="${j*Z}" x2="${w}" y2="${j*Z}" stroke="${j%50?'#0af':'#f00'}" stroke-width="1" opacity=".5"/>` + (j % 20 ? '' : `<text x="2" y="${j*Z-2}" font-size="11" fill="#f00">${j}</text>`);
    svg += `<text x="${w/2}" y="${h-4}" font-size="16" fill="#000">${f} (${m.width}x${m.height})</text></svg>`;
    comps.push({ input: img, left: x, top: 0 }, { input: Buffer.from(svg), left: x, top: 0 });
    x += w + 20; H = Math.max(H, h);
  }
  await sharp({ create: { width: x, height: H, channels: 4, background: '#fff' } }).composite(comps).png().toFile(`work/grid-${id}.png`);
})();
