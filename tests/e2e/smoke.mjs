/**
 * Browser end-to-end smoke test: the main workflow through the real UI.
 *
 *   describe a home → proposal checked by the validator → preview → apply → review is clean
 *   → undo / redo → reload restores the project → a repair → the hosted-model path (MOCKED)
 *
 * Starts its own Next.js dev server. The hosted-model step intercepts /api/assistant with a
 * scripted response: it checks the client's error handling, not a real provider.
 *
 * Run: npm run e2e   (needs a Playwright Chromium: npx playwright install chromium)
 */

import { startServer } from "./server.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";

const PORT = 5298;
const server = await startServer(PORT);
const STUDIO = `${server.url}/studio/try`;
// Playwright's own Chromium if installed, otherwise the system Chrome
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// the mocked 503 in the hosted-model step is logged by the browser itself; it is expected
page.on("console", (m) => m.type() === "error" && !/status of 503/.test(m.text()) && errors.push(m.text()));

const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${Date.now() - t} ms)`);
  } catch (err) {
    console.log(`  ✗ ${name}`);
    await page.screenshot({ path: "tests/e2e/failure.png" });
    throw err;
  }
};
const state = () => page.evaluate(() => {
  const s = window.__clavis.store.getState();
  return { name: s.model.name, rooms: s.model.rooms.length, items: s.model.items.length, revision: s.revision };
});

try {
  console.log("Clavis e2e smoke");
  await step("opens to the welcome screen", async () => {
    await page.goto(STUDIO);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId("welcome").waitFor();
  });

  await step("a brief becomes a validated proposal", async () => {
    await page.getByRole("button", { name: "Or type it in your own words" }).click();
    await page.getByLabel("Describe a home").fill("A three-bedroom house with two bathrooms and a study, 120 m2");
    await page.getByRole("button", { name: "Design it" }).click();
    await page.getByText("Checked by the validator").waitFor();
    assert.match(await page.locator(".check-line.ok").first().innerText(), /after 0 errors, 0 warnings/);
    assert.equal((await state()).rooms, 0, "nothing is applied before the person applies it");
    await page.getByText("Previewing a proposal").waitFor();
  });

  await step("apply → measured outcome and a clean review", async () => {
    await page.getByTestId("apply-proposal").click();
    await page.getByText(/Applied at revision \d+/).first().waitFor();
    const s = await state();
    assert.ok(s.rooms >= 8 && s.items > 20, JSON.stringify(s));
    await page.getByRole("tab", { name: /Review/ }).click();
    await page.getByText("No errors or warnings").waitFor();
  });

  await step("undo and redo", async () => {
    await page.getByRole("button", { name: /Undo/ }).click();
    assert.equal((await state()).rooms, 0);
    await page.getByRole("button", { name: /Redo/ }).click();
    assert.ok((await state()).rooms >= 8);
  });

  await step("reload restores the project from the browser library", async () => {
    await page.waitForTimeout(900); // debounced autosave
    await page.reload();
    await page.locator(".save.ok").waitFor();
    const s = await state();
    assert.equal(s.name, "Three-bedroom home");
    assert.ok(s.rooms >= 8);
  });

  await step("a conflict is found and repaired", async () => {
    await page.evaluate(() => {
      const { store, actions } = window.__clavis;
      const m = store.getState().model;
      const sofa = m.items.find((i) => i.kind.startsWith("sofa"));
      const hall = m.rooms.find((r) => r.label === "Hall");
      actions.moveItem(sofa.id, hall.x + 1.2, hall.y + hall.h / 2, 0);
    });
    await page.getByRole("tab", { name: /Review/ }).click();
    await page.getByRole("button", { name: "Fix all" }).click();
    await page.getByTestId("apply-proposal").click();
    await page.getByText(/Measured after applying: 0 errors, 0 warnings/).waitFor();
  });

  await step("hosted model not configured (MOCKED /api/assistant) → clear error, offer Local", async () => {
    await page.route("**/api/assistant", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "not_configured", message: "MODEL_API_KEY is not set on the server.", retryable: false } }),
      }),
    );
    await page.evaluate(() => window.__clavis.assistant.setProvider("server"));
    await page.getByRole("tab", { name: "Chat" }).click();
    await page.locator("#assistant-input").fill("add a plant to the study");
    await page.locator("#assistant-input").press("Enter");
    await page.getByText("The hosted model is not set up").waitFor();
    await page.getByRole("button", { name: "Switch to Clavis Local" }).click();
    await page.locator(".pill.local").waitFor();
  });

  await step("a structural edit needs explicit confirmation before it can replace the layout", async () => {
    await page.getByRole("tab", { name: "Chat" }).click();
    const before = (await state()).rooms;
    await page.locator("#assistant-input").fill("add another bedroom");
    await page.locator("#assistant-input").press("Enter");
    const apply = page.getByTestId("apply-proposal");
    await apply.waitFor();
    assert.equal(await apply.isDisabled(), true, "Apply must wait for the confirmation");
    await page.getByText(/removes or replaces existing work/).click();
    await apply.click();
    await page.getByText(/Measured after applying: 0 errors, 0 warnings/).last().waitFor();
    assert.equal((await state()).rooms, before + 1);
  });

  await step("the four features: 2D plan, 3D model, walk and chat in any mix; switch the theme", async () => {
    const widths = () =>
      page.evaluate(() => Object.fromEntries([".plan-pane", ".scene-pane", ".side"].map((s) => [s.slice(1), Math.round(document.querySelector(s).getBoundingClientRect().width)])));
    const view = (label) => page.locator(".views .view", { hasText: label });
    const camera = () => page.evaluate(() => window.__clavis.store.getState().editor.camera);
    await view("Walk").click();
    assert.equal(await camera(), "walk");
    await page.locator(".walk-hud").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await camera(), "orbit");
    assert.equal(await page.locator(".walk-hud").count(), 0);
    await view("3D Model").click();
    let w = await widths();
    assert.ok(w["scene-pane"] === 0 && w["plan-pane"] > 400 && w.side > 300, `3D hidden: ${JSON.stringify(w)}`);
    await view("Chat").dblclick();
    w = await widths();
    assert.ok(w["plan-pane"] === 0 && w["scene-pane"] === 0 && w.side > 700, `chat alone: ${JSON.stringify(w)}`);
    await view("Chat").click(); // the last view on screen can't be turned off
    assert.ok((await widths()).side > 700);
    await page.keyboard.press("0");
    w = await widths();
    assert.ok(w["plan-pane"] > 200 && w["scene-pane"] > 200 && w.side > 300, `all three: ${JSON.stringify(w)}`);
    await page.getByRole("button", { name: "Switch to the dark theme" }).click();
    await page.locator('.studio[data-theme="dark"]').waitFor();
    await page.getByRole("button", { name: "Switch to the light theme" }).click();
    await page.locator('.studio[data-theme="light"]').waitFor();
  });

  await step("build by hand: ready-made rooms arrive with their walls and never overlap", async () => {
    await page.goto(`${STUDIO}?new=blank`);
    await page.getByRole("button", { name: "Start building" }).click();
    await page.locator(".guide").waitFor();
    const plan = await page.locator(".plan-pane").boundingBox();
    const at = (dx) => page.mouse.click(plan.x + plan.width * 0.5 + dx, plan.y + plan.height * 0.6);
    await page.locator('[data-block="bedroom"]').click();
    await at(0);
    await page.locator('[data-block="bathroom"]').click();
    await at(30); // dropped partly over the bedroom: it must be pushed out beside it
    await page.keyboard.press("Escape");
    const m = await page.evaluate(() => {
      const { rooms, walls } = window.__clavis.store.getState().model;
      const [a, b] = rooms;
      const overlap = a && b && a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
      return { rooms: rooms.map((r) => r.label), walls: walls.length, overlap };
    });
    assert.deepEqual(m.rooms, ["Bedroom", "Bathroom"]);
    assert.equal(m.overlap, false, "the bathroom was dropped on top of the bedroom");
    assert.ok(m.walls >= 5 && m.walls <= 8, `walls: ${m.walls}`);
  });

  await step("phone and tablet widths: no sideways scrolling, plan and panels visible", async () => {
    for (const [width, height] of [[390, 844], [900, 900]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const box = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, plan: box(".plan-pane").width, side: box(".side").width };
      });
      assert.ok(m.overflow <= 0, `${width}px: page scrolls sideways by ${m.overflow}px`);
      assert.ok(m.plan > width * 0.4 && m.side > 300, `${width}px: ${JSON.stringify(m)}`);
    }
    await page.setViewportSize({ width: 1440, height: 860 });
  });

  assert.deepEqual(errors, [], `console errors: ${errors.join("\n")}`);
  console.log("All steps passed.");
} finally {
  await browser.close();
  server.close();
}
// the result is settled; do not let a leftover handle keep the run alive
process.exit(process.exitCode ?? 0);
