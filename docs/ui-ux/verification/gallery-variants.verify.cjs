// Uses an installed Playwright and a serverctl-managed gallery URL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { measure } = require("./contrast-measure.cjs");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../apps/extension/src/gallery/component-api.generated.ts",
  ),
  "utf8",
);
const api = JSON.parse(
  source.slice(source.indexOf("["), source.lastIndexOf(" as const;")),
);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BINARY || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(5000);
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    choices: [],
    layouts: [],
    contrastMeasurements: 0,
    failures: [],
    errors: [],
  };
  page.on("pageerror", (e) => report.errors.push(e.message));
  async function capture(root, state) {
    await page.waitForFunction(
      () =>
        !document.querySelector("[data-starting-style],[data-ending-style]"),
    );
    const rows = await root.evaluate(measure);
    report.contrastMeasurements += rows.length;
    report.failures.push(
      ...rows.filter((r) => r.ratio < r.min).map((r) => ({ ...state, ...r })),
    );
  }
  try {
    await page.goto(process.argv[2]);
    await page.addStyleTag({
      content:
        "*,*::before,*::after{transition:none!important;animation:none!important}",
    });
    for (const theme of ["light", "dark"]) {
      await page
        .getByLabel("Review theme", { exact: true })
        .selectOption(theme);
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const family of [
          "S01",
          "B29",
          "B01",
          "B21",
          "P01",
          "P09",
          "F01",
        ]) {
          await page
            .getByLabel("Find a component or widget", { exact: true })
            .selectOption(family);
          const layout = await page.evaluate(() => ({
            ids: [...document.querySelectorAll(".review-specimen")].map(
              (e) => e.id,
            ),
            documentOverflow:
              document.documentElement.scrollWidth > innerWidth + 1,
            overflow: [...document.querySelectorAll(".review-specimen")]
              .filter((e) => e.scrollWidth > e.clientWidth + 1)
              .map((e) => ({
                id: e.id,
                scroll: e.scrollWidth,
                client: e.clientWidth,
              })),
          }));
          report.layouts.push({ theme, width, ...layout });
          await capture(page.locator("body"), {
            theme,
            width,
            family,
            state: "default",
          });
        }
        for (const component of api.filter((c) => Object.keys(c.axes).length)) {
          await page
            .getByLabel("Find a component or widget", { exact: true })
            .selectOption(component.family);
          const preview = page.locator(
            `[data-gallery-variants="${component.family}"]`,
          );
          await preview
            .getByLabel(`${component.family} variant component`, {
              exact: true,
            })
            .selectOption(component.name);
          for (const [axis, values] of Object.entries(component.axes)) {
            const chooser = preview.getByLabel(`${component.name} ${axis}`, {
              exact: true,
            });
            const initial = await chooser.inputValue();
            for (const value of values) {
              await chooser.selectOption(value);
              const state = {
                theme,
                width,
                component: component.name,
                family: component.family,
                axis,
                value,
              };
              const label = await preview
                .locator("[data-gallery-selection]")
                .innerText();
              if (!label.includes(`${axis}=${value}`))
                throw new Error(
                  "Selection label mismatch: " + JSON.stringify(state),
                );
              const demo = preview.locator("[data-gallery-variant-demo]");
              const bounds = await demo.evaluate((e) => ({
                children: e.children.length,
                overflow: e.scrollWidth > e.clientWidth + 1,
                scroll: e.scrollWidth,
                client: e.clientWidth,
              }));
              if (!bounds.children)
                throw new Error(
                  "Empty variant preview: " + JSON.stringify(state),
                );
              report.choices.push({ ...state, ...bounds });
              await capture(demo, state);
              // Open portal fixtures so placement/size variants are actually rendered.
              if (
                ["B15", "B16", "B17", "B24", "B28", "B32"].includes(
                  component.family,
                )
              ) {
                const trigger =
                  component.family === "B24"
                    ? demo.getByRole("combobox")
                    : demo.getByRole("button").first();
                if (component.family === "B15") {
                  await trigger.hover();
                  await page.waitForTimeout(650);
                } else {
                  await trigger.click();
                  if (component.family === "B24")
                    await page.keyboard.press("ArrowDown");
                }
                if (component.name === "DropdownMenuSubContent") {
                  await page.getByRole("menuitem", { name: "More" }).hover();
                  await page.waitForTimeout(200);
                }
                await capture(page.locator("body"), {
                  ...state,
                  state: "open",
                });
                await page.keyboard.press("Escape");
                if (component.name === "DropdownMenuSubContent")
                  await page.keyboard.press("Escape");
                await page.mouse.move(0, 0);
              }
            }
            await chooser.selectOption(initial);
          }
        }
        console.log(
          `${theme} ${width}: ${report.choices.length} choices checked`,
        );
      }
    }
    // A named compound-part jump must select its variant API, not only its family.
    await page
      .getByLabel("Find a component or widget", { exact: true })
      .selectOption("B20:TabsList");
    if (
      (await page
        .getByLabel("B20 variant component", { exact: true })
        .inputValue()) !== "TabsList"
    )
      throw new Error("Compound-part navigation did not select TabsList");
    await page
      .getByLabel("TabsList variant", { exact: true })
      .selectOption("line");
    await page
      .getByRole("button", { name: "Reset examples", exact: true })
      .click();
    if (
      (await page
        .getByLabel("B20 variant component", { exact: true })
        .inputValue()) !== "Tabs"
    )
      throw new Error("Reset did not restore initial component");
  } catch (error) {
    report.errors.push(error.stack);
  } finally {
    await browser.close();
    fs.writeFileSync(
      process.env.VARIANTS_REPORT || "/tmp/gallery-variants-results.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    const overflow =
      report.layouts.filter((r) => r.documentOverflow || r.overflow.length)
        .length + report.choices.filter((r) => r.overflow).length;
    console.log(
      JSON.stringify({
        choices: report.choices.length,
        measurements: report.contrastMeasurements,
        contrastFailures: report.failures.length,
        overflow,
        errors: report.errors,
      }),
    );
    if (report.failures.length || report.errors.length || overflow)
      process.exitCode = 1;
  }
})();
