/**
 * Capture judge screenshots from a running local server.
 *
 *   PORT=3020 node server/index.js
 *   npm install --no-save playwright
 *   node scripts/capture-screenshots.mjs http://127.0.0.1:3020
 */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "docs", "screenshots");
const base = process.argv[2] || "http://127.0.0.1:3020";

fs.mkdirSync(outDir, { recursive: true });

async function waitForDining(page, ms = 12000) {
  await page
    .waitForFunction(
      () => window.__dining && window.__dining.ready && window.__dining.ready(),
      null,
      { timeout: ms }
    )
    .catch(() => {});
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log("open / — join + start");
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("#name", "Judge");
  await page.fill("#pin", "4821");
  await page.check("#want-host");
  await page.click("#join-btn");
  await page.waitForSelector("#game:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(800);

  for (let i = 0; i < 2; i++) {
    const add = page.locator("#add-bot-btn");
    if (await add.isVisible().catch(() => false)) {
      if (!(await add.isDisabled().catch(() => true))) await add.click();
      await page.waitForTimeout(400);
    }
  }

  const ready = page.locator("#ready-btn");
  if (await ready.isVisible().catch(() => false)) {
    if (!(await ready.isDisabled().catch(() => true))) await ready.click();
    await page.waitForTimeout(500);
  }

  const start = page.locator("#start-game-btn");
  if (await start.isVisible().catch(() => false)) {
    if (!(await start.isDisabled().catch(() => true))) {
      page.once("dialog", (d) => d.accept());
      await start.click();
    }
  }

  await page.waitForSelector("#you-card:not([hidden])", { timeout: 20000 }).catch(() => {});
  await waitForDining(page, 15000);
  await page.waitForTimeout(2500);

  await page.screenshot({
    path: path.join(outDir, "player.png"),
    fullPage: false,
  });
  console.log("wrote player.png");

  if (await page.locator("#window-banner:not([hidden])").count()) {
    await page.screenshot({
      path: path.join(outDir, "sealed.png"),
      fullPage: false,
    });
    console.log("wrote sealed.png");
  }

  // Stream after the table is live
  const stream = await context.newPage();
  console.log("open /stream");
  await stream.goto(`${base}/stream`, { waitUntil: "networkidle", timeout: 60000 });
  await stream.waitForTimeout(4500);
  await stream.screenshot({
    path: path.join(outDir, "stream.png"),
    fullPage: false,
  });
  console.log("wrote stream.png");

  await browser.close();
  console.log("done", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
