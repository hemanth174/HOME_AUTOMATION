import sharp from "sharp";

const source = "public/vikatech-header-logo.png";
const output = "public/vikatech-header-logo-rounded.png";
const icon = await sharp(source)
  .extract({ left: 245, top: 18, width: 420, height: 355 })
  .resize({ width: 150, height: 142, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toBuffer();

const wordmark = await sharp(source)
  .extract({ left: 10, top: 390, width: 880, height: 170 })
  .resize({ width: 500, height: 92, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toBuffer();

const roundedBackground = Buffer.from(`
  <svg width="768" height="240" xmlns="http://www.w3.org/2000/svg">
    <rect width="768" height="240" rx="120" fill="white" />
  </svg>
`);

await sharp({
  create: {
    width: 768,
    height: 240,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: roundedBackground },
    { input: icon, left: 32, top: 49 },
    { input: wordmark, left: 211, top: 74 },
  ])
  .png()
  .toFile(output);

console.log(`Created ${output}`);
