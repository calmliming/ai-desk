/**
 * 生成 AIDesk 站点图标：
 *   src/app/icon.svg        —— 矢量 favicon（现代浏览器优先）
 *   src/app/icon.png        —— 512px PNG 回退
 *   src/app/apple-icon.png  —— 180px iOS 主屏图标
 *
 * 运行：pnpm generate:icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "src", "app");

// 与侧边栏 Logo 一致：紫→品红渐变圆角方块 + 白色四角星
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f59e0b"/>
      <stop offset="0.55" stop-color="#f97316"/>
      <stop offset="1" stop-color="#ea580c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.22" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="116" fill="url(#g)"/>
  <rect width="512" height="512" rx="116" fill="url(#glow)"/>
  <path d="M256 42.7 307.2 204.8 469.3 256 307.2 307.2 256 469.3 204.8 307.2 42.7 256 204.8 204.8 Z"
        fill="#ffffff" fill-opacity="0.96"/>
</svg>`;

const svgSource = svg(512);

await mkdir(appDir, { recursive: true });
await writeFile(path.join(appDir, "icon.svg"), svgSource, "utf8");

await sharp(Buffer.from(svgSource))
  .resize(512, 512)
  .png()
  .toFile(path.join(appDir, "icon.png"));

await sharp(Buffer.from(svgSource))
  .resize(180, 180)
  .png()
  .toFile(path.join(appDir, "apple-icon.png"));

console.log("✓ 已生成 src/app/icon.svg、icon.png(512)、apple-icon.png(180)");
