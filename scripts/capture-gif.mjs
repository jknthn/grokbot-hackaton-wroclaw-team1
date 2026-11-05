/**
 * Record a short demo GIF: join → start → living table.
 *   PORT=3030 node server/index.js
 *   node scripts/capture-gif.mjs http://127.0.0.1:3030
 */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "docs", "screenshots");
const tmpDir = path.join(outDir, "_tmp");
const base = process.argv[2] || "http://127.0.0.1:3030";

fs.mkdirSync(tmpDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: tmpDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.fill("#name", "Judge");
  await page.fill("#pin", "4821");
  await page.check("#want-host");
  await page.click("#join-btn");
  await page.waitForSelector("#game:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(700);

  for (let i = 0; i < 2; i++) {
    const add = page.locator("#add-bot-btn");
    if ((await add.isVisible().catch(() => false)) && !(await add.isDisabled())) {
      await add.click();
      await page.waitForTimeout(350);
    }
  }

  const ready = page.locator("#ready-btn");
  if ((await ready.isVisible().catch(() => false)) && !(await ready.isDisabled())) {
    await ready.click();
    await page.waitForTimeout(400);
  }

  const start = page.locator("#start-game-btn");
  if ((await start.isVisible().catch(() => false)) && !(await start.isDisabled())) {
    page.once("dialog", (d) => d.accept());
    await start.click();
  }

  await page.waitForSelector("#you-card:not([hidden])", { timeout: 20000 }).catch(() => {});
  await page
    .waitForFunction(
      () => window.__dining && window.__dining.ready && window.__dining.ready(),
      null,
      { timeout: 15000 }
    )
    .catch(() => {});
  // Hold on the living table so the GIF lands on the money shot
  await page.waitForTimeout(5500);

  await context.close();
  await browser.close();

  const webm = fs.readdirSync(tmpDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no webm recorded");
  const webmPath = path.join(tmpDir, webm);
  const gifPath = path.join(outDir, "demo.gif");
  const palette = path.join(tmpDir, "palette.png");

  // Keep under ~3–4MB for GitHub README
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      webmPath,
      "-vf",
      "fps=8,scale=720:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff",
      "-update",
      "1",
      palette,
    ],
    { stdio: "inherit" }
  );
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      webmPath,
      "-i",
      palette,
      "-lavfi",
      "fps=8,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5",
      "-loop",
      "0",
      gifPath,
    ],
    { stdio: "inherit" }
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  const kb = Math.round(fs.statSync(gifPath).size / 1024);
  console.log(`wrote ${gifPath} (${kb} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
