import sharp from 'sharp';
import { readFileSync } from 'fs';

const source = readFileSync('static/img/logo.svg');
const bg = { r: 13, g: 17, b: 23, alpha: 1 };

// favicon.png (128x128)
await sharp(source).resize(128, 128).png().toFile('static/favicon.png');
console.log('Generated favicon.png');

const sizes = [192, 512];
for (const size of sizes) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toFile(`static/img/icon-${size}.png`);
  console.log(`Generated icon-${size}.png`);
}

// Maskable icon: add 10% safe area padding
await sharp(source)
  .resize(410, 410, { fit: 'contain', background: bg })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: bg })
  .png()
  .toFile('static/img/icon-maskable-512.png');
console.log('Generated icon-maskable-512.png');

