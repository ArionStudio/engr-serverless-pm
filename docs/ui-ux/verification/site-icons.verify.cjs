// Run on Linux after ext:build. Uses a disposable profile and Chromium NetLog.
// PLAYWRIGHT_MODULE points to an existing Playwright installation.
// Native permission dialogs are not automated. A temporary manifest additionally
// grants favicon as required for cache/network/lifecycle checks only. Production
// code is unchanged. This does not validate native grant, denial or revocation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const artifacts = path.resolve(".local/site-icons-validation");
const fixtureOrigin = "https://icons-known.lfspm.test";
const unknownOrigin = "https://icons-unknown.lfspm.test";
const fixtureIcon =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff00ff"/></svg>',
  ).toString("base64");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lfspm-icons-"));
  let context;
  const result = {
    nativePermissionConsent:
      "not automated; temporary manifest pregrants favicon",
    checks: [],
    errors: [],
  };
  try {
    const profile = path.join(temporary, "profile");
    const extension = path.join(temporary, "extension");
    fs.cpSync(path.resolve("apps/extension/dist"), extension, {
      recursive: true,
    });
    const manifestPath = path.join(extension, "manifest.json");
    const productionManifest = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(productionManifest);
    assert(manifest.optional_permissions.includes("favicon"));
    const netlog = path.join(artifacts, "netlog.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        ...manifest,
        permissions: [...manifest.permissions, "favicon"],
      }),
    );
    context = await chromium.launchPersistentContext(profile, {
      executablePath:
        process.env.CHROMIUM_EXECUTABLE || "/usr/bin/google-chrome",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--enable-unsafe-extension-debugging", `--log-net-log=${netlog}`],
      viewport: { width: 1280, height: 1000 },
    });
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: extension,
    });
    const origin = `chrome-extension://${id}`;
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    async function observe(target, label) {
      target.on("pageerror", (error) =>
        result.errors.push(`${label}: ${error.message}`),
      );
      target.on("console", (message) => {
        if (["warning", "error"].includes(message.type()))
          result.errors.push(`${label}: ${message.text()}`);
      });
      const log = await context.newCDPSession(target);
      await log.send("Log.enable");
      log.on("Log.entryAdded", ({ entry }) => {
        if (["warning", "error"].includes(entry.level))
          result.errors.push(`${label}: ${entry.text}`);
      });
    }
    await observe(page, "options");
    await page.goto(origin + "/options.html");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByLabel("New password", { exact: true })
      .fill("orbit lantern velvet canyon river");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("orbit lantern velvet canyon river");
    await page.getByText("Strong", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByLabel("Device name", { exact: true })
      .fill("Disposable icons check");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Continue to recovery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reveal recovery words", exact: true })
      .click();
    const words = await page
      .locator('section[aria-label="Recovery words"] li')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.lastElementChild.textContent),
      );
    await page.getByRole("button", { name: "I saved all 24 words" }).click();
    for (const label of (await page.locator("label").allTextContents()).filter(
      (value) => /^Word \d+$/.test(value),
    )) {
      await page
        .getByLabel(label, { exact: true })
        .fill(words[Number(label.split(" ")[1]) - 1]);
    }
    await page
      .getByRole("button", { name: "Check words", exact: true })
      .click();
    await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
    for (const [login, url] of [
      ["cached-account", fixtureOrigin + "/private/account?token=omit#secret"],
      ["unknown-account", unknownOrigin + "/private/account"],
    ]) {
      await page
        .getByRole("button", { name: "Add entry", exact: true })
        .first()
        .click();
      await page.getByLabel("Login", { exact: true }).fill(login);
      await page.getByLabel("Website", { exact: true }).fill(url);
      await page
        .getByLabel("Password", { exact: true })
        .fill("entry violet meadow lantern river");
      await page.getByText("Strong", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Add entry", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Entries", exact: true })
        .waitFor();
    }
    assert.equal(await page.locator('img[src*="/_favicon/"]').count(), 0);
    let fixtureRequests = 0;
    await context.route(fixtureOrigin + "/**", async (route) => {
      fixtureRequests++;
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Controlled cached favicon</title><link rel="icon" href="${fixtureIcon}"><h1>Controlled fixture</h1>`,
      });
    });
    const site = await context.newPage();
    await site.goto(fixtureOrigin + "/");
    await delay(1500);
    await site.close();
    const requestsAfterPriming = fixtureRequests;
    // Chromium NetLog and Node's hrtime share CLOCK_MONOTONIC on Linux.
    result.iconLookupStartedAt = Number(process.hrtime.bigint() / 1000000n);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("switch", { name: "Website icons", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector('[role="switch"][aria-checked="true"]'),
    );
    assert.equal(
      await page.evaluate(() =>
        chrome.permissions.contains({ permissions: ["favicon"] }),
      ),
      true,
    );
    result.checks.push(
      "Options settings enables icons with fixture-granted favicon permission",
    );
    const permissions = await page.evaluate(() => chrome.permissions.getAll());
    assert(!(permissions.permissions ?? []).includes("tabs"));
    assert(!(permissions.permissions ?? []).includes("history"));
    assert.equal((permissions.origins ?? []).length, 0);
    const popup = await context.newPage();
    await observe(popup, "popup document");
    await popup.goto(origin + "/popup.html");
    await popup.getByRole("button", { name: "Settings", exact: true }).click();
    await popup
      .getByRole("switch", { name: "Website icons", exact: true })
      .waitFor();
    assert.equal(
      await popup
        .getByRole("switch", { name: "Website icons", exact: true })
        .getAttribute("aria-checked"),
      "true",
    );
    await page.getByRole("button", { name: "Entries", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('img[src*="/_favicon/"]').length === 2,
    );
    const sources = await page
      .locator('img[src*="/_favicon/"]')
      .evaluateAll((images) => images.map((image) => image.src));
    assert.deepEqual(
      sources
        .map((source) => new URL(source).searchParams.get("pageUrl"))
        .sort(),
      [fixtureOrigin + "/", unknownOrigin + "/"].sort(),
    );
    result.checks.push("Only normalized origins enter favicon requests");
    result.sources = sources;
    result.imageDimensions = await page
      .locator('img[src*="/_favicon/"]')
      .evaluateAll((images) =>
        images.map((image) => ({
          width: image.naturalWidth,
          height: image.naturalHeight,
        })),
      );
    result.imageHashes = await page.evaluate(
      async (sources) =>
        Promise.all(
          sources.map(async (source) => {
            const bytes = await (await fetch(source)).arrayBuffer();
            return Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            )
              .map((value) => value.toString(16).padStart(2, "0"))
              .join("");
          }),
        ),
      sources,
    );
    assert.equal(
      new Set(result.imageHashes).size,
      2,
      "Known cached icon must differ from Chrome's unknown-site default",
    );
    result.checks.push(
      "Real cached favicon differs from unknown-site fallback",
    );
    await popup.evaluate(() =>
      chrome.storage.local.set({ siteIconsEnabled: false }),
    );
    await page.waitForFunction(
      () => document.querySelectorAll('img[src*="/_favicon/"]').length === 0,
    );
    await popup.waitForFunction(() =>
      document.querySelector('[role="switch"][aria-checked="false"]'),
    );
    result.checks.push("Preference removal clears sources in both contexts");
    await popup
      .getByRole("switch", { name: "Website icons", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('img[src*="/_favicon/"]').length === 2,
    );
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll('img[src*="/_favicon/"]').length === 2,
    );
    await page.waitForFunction(() => {
      const images = Array.from(
        document.querySelectorAll('img[src*="/_favicon/"]'),
      );
      return (
        images.length === 2 &&
        images.every(
          (image) =>
            image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
        )
      );
    });
    result.checks.push("Cached and unknown icons remain usable offline");
    await context.setOffline(false);
    await popup.getByRole("button", { name: "Vault", exact: true }).click();
    for (const target of [page, popup]) {
      await target.getByText("cached-account", { exact: true }).waitFor();
      await target.getByText("unknown-account", { exact: true }).waitFor();
      await target.waitForFunction(
        () => document.querySelectorAll('img[src*="/_favicon/"]').length === 2,
      );
    }
    await page.getByRole("button", { name: "Lock vault", exact: true }).click();
    for (const target of [page, popup]) {
      await target.waitForFunction(
        () =>
          !document.body.textContent.includes("cached-account") &&
          !document.body.textContent.includes("unknown-account") &&
          !document.querySelector('img[src*="/_favicon/"]'),
      );
    }
    result.checks.push("Lock removes icon and entry metadata across contexts");
    assert.equal(fixtureRequests, requestsAfterPriming);
    const local = await page.evaluate(() => chrome.storage.local.get(null));
    assert(!JSON.stringify(local).includes("lfspm.test"));
    assert(!JSON.stringify(local).includes("cached-account"));
    result.checks.push("No per-site metadata persisted in browser preferences");
    await delay(3500);
    assert.deepEqual(result.errors, []);
    result.browser = context.browser().version();
    await context.close();
    context = undefined;
    const net = JSON.parse(fs.readFileSync(netlog, "utf8"));
    assert(Number(net.events[0].time) <= result.iconLookupStartedAt);
    assert(Number(net.events.at(-1).time) >= result.iconLookupStartedAt);
    const fixtureEvents = net.events.filter(
      (event) =>
        Number(event.time) >= result.iconLookupStartedAt &&
        Object.values(event.params ?? {}).some((value) => {
          if (typeof value !== "string") return false;
          if (/^[\w.-]+\.lfspm\.test(?::\d+)?$/.test(value)) return true;
          try {
            const url = new URL(value);
            return (
              ["http:", "https:"].includes(url.protocol) &&
              url.hostname.endsWith(".lfspm.test")
            );
          } catch {
            return false;
          }
        }),
    );
    result.netlogFixtureEvents = fixtureEvents;
    assert.equal(
      fixtureEvents.length,
      0,
      "Browser NetLog must not contain network fetches or DNS lookups for controlled fixture sites",
    );
    result.checks.push(
      "Browser-wide NetLog records no fixture network fetch or DNS lookup",
    );
    console.log(
      JSON.stringify(
        {
          checks: result.checks,
          browser: result.browser,
          nativePermissionConsent: result.nativePermissionConsent,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      await context?.close();
    } finally {
      try {
        fs.writeFileSync(
          path.join(artifacts, "result.json"),
          JSON.stringify(result, null, 2),
        );
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
