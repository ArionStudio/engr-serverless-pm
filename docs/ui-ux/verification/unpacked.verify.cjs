// Run from the repository root after pnpm ext:build. Uses an installed Playwright.
// This temporary Chrome profile contains no user vault or browsing data.
// Loader API: https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-loadUnpacked
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

(async () => {
  const profile = mkdtempSync(join(tmpdir(), "lfspm-unpacked-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROME_BINARY || "/usr/bin/google-chrome",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--no-sandbox", "--enable-unsafe-extension-debugging"],
    });
    const page = await context.newPage();
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: resolve(process.argv[2] || "apps/extension/dist"),
    });
    const errors = new Set();
    page.on("pageerror", (error) => errors.add(error.message));
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type()))
        errors.add(message.text());
    });
    const pageCdp = await context.newCDPSession(page);
    await pageCdp.send("Log.enable");
    pageCdp.on("Log.entryAdded", ({ entry }) => {
      if (["warning", "error"].includes(entry.level)) errors.add(entry.text);
    });
    const pages = [];
    for (const entry of ["popup", "options"]) {
      await page.goto(`chrome-extension://${id}/${entry}.html`);
      await page.locator(`#${entry} > *`).first().waitFor();
      // Chrome emits unused-preload warnings several seconds after load.
      await page.waitForTimeout(6000);
      pages.push({ entry, title: await page.title() });
    }
    const backgroundRunning = context
      .serviceWorkers()
      .some(
        (worker) => worker.url() === `chrome-extension://${id}/background.js`,
      );
    if (!backgroundRunning)
      errors.add("Background service worker did not start.");
    console.info(
      JSON.stringify(
        {
          browser: context.browser().version(),
          pages,
          backgroundRunning,
          errors: [...errors],
        },
        null,
        2,
      ),
    );
    if (errors.size) process.exitCode = 1;
  } finally {
    await context?.close();
    rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
