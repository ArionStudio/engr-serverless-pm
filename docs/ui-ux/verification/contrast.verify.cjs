const { measure } = require("./contrast-measure.cjs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
(async () => {
  const url = process.argv[2];
  if (!url) throw new Error("Pass the serverctl gallery URL");
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BINARY || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const samples = [],
    coverage = new Map(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function capture(theme, state, root = page.locator("body")) {
    await page.waitForFunction(
      () =>
        !document.querySelector("[data-starting-style],[data-ending-style]"),
    );
    const rows = await root.evaluate(measure);
    samples.push(...rows.map((r) => ({ ...r, theme, state })));
    for (const id of await page
      .locator(".review-specimen")
      .evaluateAll((es) => es.map((e) => e.id))) {
      const k = theme + ":" + id;
      coverage.set(k, (coverage.get(k) || 0) + 1);
    }
  }
  try {
    for (const theme of ["light", "dark"]) {
      await page.goto(url);
      await page.getByLabel("Review theme").selectOption(theme);
      // Measure settled states; transitions can otherwise return intermediate colors.
      await page.addStyleTag({
        content:
          "*,*::before,*::after{transition:none!important;animation:none!important}",
      });
      for (const collection of [
        "S01",
        "B29",
        "B01",
        "B21",
        "P01",
        "P09",
        "F01",
      ]) {
        await page
          .getByLabel("Find a component or widget")
          .selectOption(collection);
        await capture(theme, collection + ":default");
        const selectors = await page
          .locator('.review-specimen select[aria-label$=" state"]')
          .evaluateAll((es) =>
            es.map((e) => ({
              label: e.getAttribute("aria-label"),
              values: [...e.options].map((o) => o.value),
            })),
          );
        for (const { label, values } of selectors) {
          for (const value of values.slice(1)) {
            await page.getByLabel(label, { exact: true }).selectOption(value);
            await capture(theme, label + ":" + value);
          }
          await page.getByLabel(label, { exact: true }).selectOption(values[0]);
        }
        // Each distinct enabled control style in each specimen, in hover and keyboard focus.
        const controls = page.locator(
          ".review-specimen :is(button,a[href],input:not([type=hidden]):not([type=range]),textarea,select,[role=slider],[role=separator][tabindex])",
        );
        const seen = new Set();
        await page.keyboard.press("Tab");
        for (let i = 0; i < (await controls.count()); i++) {
          const el = controls.nth(i);
          if (
            !(await el.isVisible()) ||
            !(await el.isEnabled()) ||
            (await el.evaluate(
              (e) => !!e.closest("[aria-hidden=true],[inert]"),
            ))
          )
            continue;
          const key = await el.evaluate((e) =>
            [
              e.closest(".review-specimen").id,
              e.tagName,
              e.className,
              e.getAttribute("aria-checked"),
              e.getAttribute("aria-pressed"),
            ].join("|"),
          );
          if (seen.has(key)) continue;
          seen.add(key);
          await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
          await el.hover({ force: true });
          await capture(theme, collection + ":hover", el);
          await page.mouse.move(0, 0);
          await el.focus();
          await capture(theme, collection + ":focus", el);
        }
      }
      // Popup layers and interactive choices are outside the specimen DOM.
      for (const [id, label, kind] of [
        ["B15", "Supplementary help", "tooltip"],
        ["B16", "Example actions", "click"],
        ["B17", "Open confirmation", "click"],
        ["B19", "Open example dialog", "click"],
        ["B28", null, "click"],
        ["B32", "Display preferences", "click"],
        ["B33", "error", "click"],
      ]) {
        await page.getByLabel("Find a component or widget").selectOption(id);
        const trigger = label
          ? page
              .locator("#" + id)
              .getByRole("button", { name: label, exact: true })
          : page.locator("#" + id + " button").first();
        if (kind === "tooltip") {
          await trigger.hover();
          await page.waitForTimeout(800);
        } else await trigger.click();
        await capture(theme, id + ":open");
        await page.keyboard.press("ArrowDown");
        await capture(theme, id + ":open-keyboard");
        await page.keyboard.press("Escape");
        await page.mouse.move(0, 0);
      }
      for (const id of ["B24", "P27"]) {
        await page.getByLabel("Find a component or widget").selectOption(id);
        const input = page.locator("#" + id + " input[role=combobox]").first();
        await input.click();
        await page.keyboard.press("ArrowDown");
        await capture(theme, id + ":options");
        await page.keyboard.press("Escape");
      }
      for (const [id, role] of [
        ["B07", "checkbox"],
        ["B31", "switch"],
        ["B35", "button"],
        ["B20", "tab"],
      ]) {
        await page.getByLabel("Find a component or widget").selectOption(id);
        const control = page
          .locator("#" + id)
          .getByRole(role)
          .filter({ visible: true });
        await control
          .last()
          .isEnabled()
          .then((enabled) =>
            enabled ? control.last().click() : control.first().click(),
          );
        await capture(theme, id + ":toggled");
      }
      await page.setViewportSize({ width: 320, height: 1000 });
      for (const id of ["S01", "B29", "B01", "B21", "P01", "P09", "F01"]) {
        await page.getByLabel("Find a component or widget").selectOption(id);
        await capture(theme, id + ":320px");
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      console.log(theme + " finished");
    }
    const failures = samples.filter((r) => r.ratio < r.min);
    const report = {
      date: new Date().toISOString(),
      browser: browser.version(),
      measurements: samples.length,
      coverage: Object.fromEntries(coverage),
      states: [...new Set(samples.map((s) => s.theme + ":" + s.state))],
      failures,
      errors,
    };
    const byId = {};
    for (const s of samples) {
      const k = s.theme + ":" + s.id;
      const group = (byId[k] ??= {
        measurements: 0,
        minText: null,
        minNonText: null,
      });
      group.measurements++;
      const name = ["text", "placeholder"].includes(s.kind)
        ? "minText"
        : "minNonText";
      group[name] = Math.min(group[name] ?? Infinity, s.ratio);
    }
    report.byId = byId;
    fs.writeFileSync(
      process.env.CONTRAST_REPORT || "/tmp/contrast-full.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        measurements: samples.length,
        catalogCoverage: coverage.size,
        failures: failures.length,
        errors,
      }),
    );
    console.log([
      ...new Map(
        failures.map((r) => [
          [r.theme, r.id, r.kind, r.color, r.text].join("|"),
          [r.theme, r.id, r.kind, r.text, Number(r.ratio.toFixed(2)), r.color],
        ]),
      ).values(),
    ]);
    if (failures.length || errors.length || coverage.size !== 150)
      process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
