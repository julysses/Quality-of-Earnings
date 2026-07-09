// Screenshot helper for design review: node scripts/e2e-screenshot.mjs <path> <out.png>
import { launch } from "./e2e-signup.mjs";

const [, , path = "/login", out = "shot.png"] = process.argv;
const { browser, page } = await launch();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`http://localhost:3000${path}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("saved", out);
