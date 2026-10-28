// API and wizard regression: node scripts/check-brand.mjs (one server on :3000).
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { DEFAULT_BRAND } from "../src/types/brand.ts";

const base = "http://127.0.0.1:3000";
const original = await (await fetch(base + "/api/brand")).json();
for (const [body, field] of [
  [{ colors: { primary: "#1a1a2e#14213D" } }, "colors.primary"],
  [{ colors: { surface: "red" } }, "colors.surface"],
  [{ fonts: { heading: "Inter';color:red" } }, "fonts.heading"],
  [{ fonts: { body: "../Arial" } }, "fonts.body"],
  [{ fonts: { heading: " " } }, "fonts.heading"],
  [{ customFonts: [{ name: "Inter", path: "/outside/font.ttf" }] }, "customFonts"],
]) {
  const response = await fetch(base + "/api/brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).field, field);
}
assert.deepEqual(await (await fetch(base + "/api/brand")).json(), original, "invalid writes leave the brand unchanged");

const browser = await puppeteer.launch({ headless: true, args: ["--disable-gpu"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  let puts = 0;
  page.on("request", (request) => {
    if (request.url() === base + "/api/brand") {
      if (request.method() === "PUT") {
        puts++;
        request.respond({ status: 400, contentType: "application/json", body: JSON.stringify({ field: "colors.secondary", error: "Use a hex color (#rgb or #rrggbb)." }) });
      } else {
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...DEFAULT_BRAND, name: "Brand fixture", fonts: { heading: "../Arial", body: "Inter" } }) });
      }
    } else request.continue();
  });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click('button[aria-label="Brand settings"]');
  const clickButton = async (label) => {
    for (const button of await page.$$('[role="dialog"] button')) {
      if (await button.evaluate((el, label) => el.textContent.trim() === label, label)) {
        await button.click();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return;
      }
    }
    assert.fail(`Missing wizard button: ${label}; ${await page.$eval('[role="dialog"]', (el) => el.textContent)}`);
  };
  const next = () => clickButton("Next");
  const inputFor = async (label) => {
    const id = await page.evaluate((label) => [...document.querySelectorAll('[role="dialog"] label')].find((el) => el.textContent.trim() === label)?.htmlFor, label);
    assert.ok(id, `label ${label} is associated with a field`);
    return page.$(`[id="${id}"]`);
  };
  const fill = async (input, value) => {
    await input.click({ clickCount: 3 });
    await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control");
    await input.type(value);
  };
  const alertFor = (input) => input.evaluate((el) => ({
    invalid: el.getAttribute("aria-invalid"),
    role: document.getElementById(el.getAttribute("aria-describedby"))?.getAttribute("role"),
    text: document.getElementById(el.getAttribute("aria-describedby"))?.textContent,
  }));

  await next();
  const primary = await inputFor("Primary");
  await fill(primary, "#1a1a2e#14213D");
  await next();
  assert.equal((await alertFor(primary)).invalid, "true");
  assert.equal((await alertFor(primary)).role, "alert");
  assert.match((await alertFor(primary)).text, /hex color/);
  assert.equal(puts, 0, "invalid colors stay in their step before any save");
  await fill(primary, "#14213D");
  await next();
  const heading = await inputFor("Heading font");
  await next();
  assert.equal((await alertFor(heading)).invalid, "true");
  assert.equal((await alertFor(heading)).role, "alert");
  assert.match((await alertFor(heading)).text, /font name/);
  await heading.select("Inter");
  await next(); // Logo.
  await next(); // Style.
  await clickButton("Done");
  await page.waitForFunction(() => document.querySelector('[role="dialog"] input[aria-invalid="true"]'));
  const secondary = await inputFor("Secondary");
  assert.equal((await alertFor(secondary)).role, "alert", "API errors return to the field's step");
  assert.equal(puts, 1);
  assert.deepEqual(errors, []);
  console.log("brand: invalid API writes and field-local wizard/server errors pass");
} finally {
  await browser.close();
}
