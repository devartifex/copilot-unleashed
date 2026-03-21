import sharp from 'sharp';

const sizes = [192, 512];
const source = 'static/favicon.png';

for (const size of sizes) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 13, g: 17, b: 23, alpha: 1 } })
    .png()
    .toFile(`static/img/icon-${size}.png`);
  console.log(`Generated icon-${size}.png`);
}

// Maskable icon: add 10% safe area padding
await sharp(source)
  .resize(410, 410, { fit: 'contain', background: { r: 13, g: 17, b: 23, alpha: 1 } })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 13, g: 17, b: 23, alpha: 1 } })
  .png()
  .toFile('static/img/icon-maskable-512.png');
console.log('Generated icon-maskable-512.png');
