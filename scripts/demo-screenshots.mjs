import { chromium } from "playwright";
import { mkdirSync } from "fs";

mkdirSync("/opt/cursor/artifacts", { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const shots = [];

async function snap(page, name) {
  const path = `/opt/cursor/artifacts/${name}`;
  await page.waitForTimeout(450);
  await page.screenshot({ path });
  shots.push(path);
}

for (const size of [
  { w: 1440, h: 900, tag: "1440x900" },
  { w: 1280, h: 800, tag: "1280x800" },
]) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("http://127.0.0.1:3000/demo", { waitUntil: "networkidle" });
  await snap(page, `mw-ui-guided-join-${size.tag}.png`);

  await page.click("[data-demo-join]");
  await page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
  await page.waitForSelector(".demo-spotlight-hole", { timeout: 5000 });
  await snap(page, `mw-ui-guided-lobby-${size.tag}.png`);

  const steps = ["blind", "reveal", "vote", "night", "ended"];
  let clicks = 0;
  while (clicks < 10 && steps.length) {
    await page.click("[data-demo-next]");
    clicks += 1;
    await page.waitForTimeout(500);
    const id = await page.evaluate(() => {
      const t = document.querySelector("[data-demo-step]")?.textContent || "";
      if (/Blind write/i.test(t)) return "blind";
      if (/REVEAL/i.test(t)) return "reveal";
      if (/^Vote —/i.test(t)) return "vote";
      if (/^Night —/i.test(t)) return "night";
      if (/Game over/i.test(t)) return "ended";
      return "";
    });
    if (id && steps[0] === id) {
      await snap(page, `mw-ui-guided-${id}-${size.tag}.png`);
      steps.shift();
    }
  }

  await page.close();
}

await browser.close();
console.log(JSON.stringify({ ok: true, errors, shots }, null, 2));
