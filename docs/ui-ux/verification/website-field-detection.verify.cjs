// Run after ext:build. Real XRBazaar metadata inspection; no credentials or submissions.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lfspm-fields-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/bin/google-chrome",
      headless: process.env.HEADED !== "1",
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--enable-unsafe-extension-debugging"],
      viewport: { width: 1280, height: 900 },
    });
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve("apps/extension/dist"),
    });
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    const management = await context.newPage();
    await management.goto("chrome://extensions");
    await management.evaluate(async (id) => {
      for (const host of [
        "https://*/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
      ])
        await chrome.developerPrivate.addHostPermission(id, host);
    }, id);
    await management.close();
    await options.evaluate(async () => {
      await chrome.permissions.request({
        origins: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
      });
      await chrome.storage.local.set({ loginDetectionEnabled: true });
      await chrome.scripting.registerContentScripts([
        {
          id: "field-verification",
          js: ["login-content.js"],
          matches: ["https://*/*"],
          runAt: "document_idle",
        },
      ]);
    });
    const site = await context.newPage();
    const inspect = () =>
      options.evaluate(async () => {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id, frameIds: [0] },
          files: ["login-content.js"],
        });
        return chrome.tabs.sendMessage(
          tabs[0].id,
          { channel: "lfspm-login", action: "inspect" },
          { frameId: 0 },
        );
      });
    await site.goto("https://xrbazaar.com/sign-in", {
      waitUntil: "domcontentloaded",
    });
    // Same-document navigation must not reject a content script with its original sender URL.
    await site.evaluate(() => history.pushState({}, "", "/sign-in#email"));
    await site.getByLabel("Email", { exact: true }).click();
    await site.locator("[data-lfspm-field-action]").waitFor();
    assert.equal((await inspect()).form.kind, "identifier");
    await site.screenshot({
      path: ".local/login-validation/xrbazaar-email.png",
    });
    await site.getByText("sign in with password", { exact: true }).click();
    await site.getByLabel("Password", { exact: true }).click();
    await site.locator("[data-lfspm-field-action]").waitFor();
    const login = await inspect();
    assert.equal(login.form.kind, "sign-in");
    assert.equal(login.fillable, true);
    await site.screenshot({
      path: ".local/login-validation/xrbazaar-password.png",
    });
    const action = await site
      .locator("[data-lfspm-field-action]")
      .boundingBox();
    await site.mouse.click(
      action.x + action.width / 2,
      action.y + action.height / 2,
    );
    let popup;
    for (let attempt = 0; attempt < 50; attempt++) {
      popup = (await cdp.send("Target.getTargets")).targetInfos.find(
        (target) => target.url === `chrome-extension://${id}/popup.html`,
      );
      if (popup) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(popup, "Recognized-field action opens the extension popup");
    await cdp.send("Target.closeTarget", { targetId: popup.targetId });
    await site.getByLabel("Password", { exact: true }).click();
    await site.waitForFunction(
      () =>
        document.querySelector("[data-lfspm-field-action]")?.childElementCount >
        0,
    );

    await site.goto("https://xrbazaar.com/sign-up", {
      waitUntil: "domcontentloaded",
    });
    await site.locator("input[type=password]").click();
    await site.locator("[data-lfspm-field-action]").waitFor();
    const registration = await inspect();
    assert.equal(registration.form.kind, "registration");
    assert.equal(registration.fillable, false);
    await site.screenshot({
      path: ".local/login-validation/xrbazaar-registration.png",
    });
    // No login fields on unrelated email forms, verified with the same real content script.
    await context.route("https://example.com/newsletter", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<form><h1>Newsletter</h1><input type="email"><button>Subscribe</button></form>',
      }),
    );
    await site.goto("https://example.com/newsletter");
    await site.locator("input").click();
    assert.equal((await inspect()).form, null);
    console.log(
      "PASS: XRBazaar identifier/password/registration fields recognized; unrelated email form excluded. No credentials entered.",
    );
  } finally {
    try {
      await context?.close();
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
