// E2E helper: browser launch (proxy-aware for sandboxed environments) and the
// signup step. Run: E2E_EMAIL=... E2E_PASSWORD=... node scripts/e2e-signup.mjs

import { chromium } from "playwright-core";

export async function launch() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    headless: true,
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" }
      : undefined,
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  return { browser, page };
}

if (process.argv[1].endsWith("e2e-signup.mjs")) {
  const EMAIL = process.env.E2E_EMAIL;
  const PASSWORD = process.env.E2E_PASSWORD;
  const { browser, page } = await launch();
  await page.goto("http://localhost:3000/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.waitForTimeout(5000);
  const body = await page.textContent("body");
  if (body.includes("Check your email")) {
    console.log("SIGNUP_NEEDS_CONFIRMATION");
  } else if (page.url().includes("/dashboard")) {
    console.log("SIGNUP_LOGGED_IN");
  } else {
    console.log("SIGNUP_UNKNOWN_STATE", page.url());
    console.log(body.slice(0, 300));
  }
  await browser.close();
}
