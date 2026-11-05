import { chromium } from "playwright";
import { mkdirSync } from "fs";

mkdirSync("/opt/cursor/artifacts", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto("http://127.0.0.1:3000/demo", { waitUntil: "networkidle" });
await page.screenshot({ path: "/opt/cursor/artifacts/mw-ui-demo-join-1440x900.png" });

await page.click("[data-demo-join]");
await page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "/opt/cursor/artifacts/mw-ui-demo-lobby-1440x900.png" });

for (let i = 0; i < 4; i++) {
  await page.click("[data-demo-next]");
  await page.waitForTimeout(600);
}
await page.screenshot({ path: "/opt/cursor/artifacts/mw-ui-demo-blind-1440x900.png" });

for (let i = 0; i < 3; i++) {
  await page.click("[data-demo-next]");
  await page.waitForTimeout(600);
}
await page.screenshot({ path: "/opt/cursor/artifacts/mw-ui-demo-vote-1440x900.png" });

for (let i = 0; i < 3; i++) {
  await page.click("[data-demo-next]");
  await page.waitForTimeout(600);
}
await page.screenshot({ path: "/opt/cursor/artifacts/mw-ui-demo-ended-1440x900.png" });

await browser.close();
console.log(JSON.stringify({ ok: true, errors }, null, 2));
