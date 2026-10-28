// Real browser regressions against one running server: node scripts/check-editor.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const base = "http://127.0.0.1:3000";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const html = (labels) => `<div style="position:relative;width:1080px;height:1350px;background:white">${labels.map((text, i) => `<div id="text-${i}" style="position:absolute;left:150px;top:${180 + i * 200}px;width:700px;height:100px;font:64px Arial;color:black">${text}</div>`).join("")}</div>`;

async function json(path, method = "GET", body) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
  return res.json();
}

const carousel = await json("/api/carousels", "POST", { name: "Editor regression fixture" });
let browser;
try {
  const slide = await json(`/api/carousels/${carousel.id}/slides?audit=0`, "POST", { html: html(["First text", "Second text"]) });
  browser = await puppeteer.launch({ headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ready = async () => {
    await page.waitForFunction(() => document.querySelector('iframe[sandbox="allow-same-origin"]')?.contentDocument?.getElementById("__oc_inspector_styles__"));
    await page.waitForFunction(() => document.querySelectorAll('aside[aria-label="Layers and properties"] li').length === 2);
  };
  const state = () => page.evaluate(() => {
    const iframe = document.querySelector('iframe[sandbox="allow-same-origin"]');
    const frame = iframe.getBoundingClientRect();
    const el = iframe.contentDocument.getElementById("text-0");
    const rect = el.getBoundingClientRect();
    const scale = frame.width / 1080;
    return {
      x: frame.left + (rect.left + 100) * scale,
      y: frame.top + (rect.top + 45) * scale,
      left: el.offsetLeft, width: el.offsetWidth, transform: el.style.transform,
      editing: el.isContentEditable, text: el.textContent,
    };
  });
  const drag = async (point, dx, dy) => {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 });
    await page.mouse.up();
    await pause(100);
  };

  for (const selected of [false, true]) {
    await page.goto(`${base}/carousel/${carousel.id}`, { waitUntil: "networkidle0" });
    await ready();
    const point = await state();
    if (selected) { await page.mouse.click(point.x, point.y); await pause(500); }
    await page.mouse.click(point.x, point.y);
    await pause(80); // Let the selection overlay intercept the second press.
    await page.mouse.click(point.x, point.y);
    assert.equal((await state()).editing, true, `double click (${selected ? "selected" : "unselected"}) enters editing`);
    await page.keyboard.type("X");
    assert.ok((await state()).text.includes("X"), "typing reaches the selected text");
    await page.keyboard.press("Escape");
    assert.equal((await state()).editing, false);
    await pause(500);
  }

  const before = await state();
  await drag(before, 40, 0);
  assert.ok((await state()).left > before.left + 10, "overlay still moves text");
  const moved = await state();
  await drag(moved, 30, 0);
  assert.ok((await state()).left > moved.left + 10, "consecutive drags do not enter text editing");
  const size = await state();
  const handle = await page.$('[data-oc-handle="se"]');
  const box = await handle.boundingBox();
  await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, 35, 15);
  assert.ok((await state()).width > size.width, "resize handle still resizes text");
  const rotate = await page.$('button[aria-label="Rotate"]');
  const rotationBox = await rotate.boundingBox();
  await drag({ x: rotationBox.x + 14, y: rotationBox.y + 14 }, 70, -20);
  assert.match((await state()).transform, /rotate\(/, "rotation handle still rotates text");

  await page.goto(`${base}/carousel/${carousel.id}`, { waitUntil: "networkidle0" });
  await ready();
  await page.setRequestInterception(true);
  let receiveChat;
  const chatRequested = new Promise((resolve) => { receiveChat = resolve; });
  page.on("request", (request) => {
    // Hold the CLI stream open while writes use the real API and generation poll.
    if (request.url() === base + "/api/chat" && request.method() === "POST") receiveChat(request);
    else request.continue();
  });
  if (!await page.$('textarea[aria-label="Message for the AI"]')) {
    await page.locator("button").filter((el) => el.textContent.trim() === "AI").click();
  }
  await page.type('textarea[aria-label="Message for the AI"]', "Update the current slide");
  await page.click('button[aria-label="Send the message"]');
  const request = await chatRequested;
  const layers = () => page.$$eval('aside[aria-label="Layers and properties"] li button[title*="double-click to rename"]', (nodes) => nodes.map((n) => n.textContent.trim()).sort());
  const labels = ["Agent heading", "Agent body", "Agent footer"];
  await json(`/api/carousels/${carousel.id}/slides/${slide.id}`, "PUT", { html: html(labels) });
  await pause(1600);
  const during = await layers();
  await request.respond({ status: 200, contentType: "text/event-stream", body: 'data: {"type":"result","text":"Done"}\n\n' });
  await pause(1200);
  assert.deepEqual(during, [...labels].sort(), "Layers updates while the agent writes");
  assert.deepEqual(await layers(), [...labels].sort(), "Layers keeps the new document after generation");
  assert.equal((await json(`/api/carousels/${carousel.id}`)).slides[0].html, html(labels), "stale autosave never overwrites the agent's HTML");
  assert.deepEqual(errors, [], "no browser exceptions");
  console.log("editor: text editing, gestures and live agent layers pass");
} finally {
  if (browser) await browser.close();
  await json(`/api/carousels/${carousel.id}`, "DELETE");
}
