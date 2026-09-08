// Run after ext:build with an installed Playwright. Uses disposable vaults and
// intercepted S3 responses, never a real AWS account or user browser profile.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lfspm-sync-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_BINARY || "/usr/bin/google-chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--no-sandbox", "--enable-unsafe-extension-debugging"],
    viewport: { width: 1280, height: 1000 },
  });
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve("apps/extension/dist"),
    });
    const origin = `chrome-extension://${id}`;
    // Browser-owned permission grant for headless automation. The production
    // click path still calls permissions.request; no permission API is mocked.
    const management = await context.newPage();
    await management.goto("chrome://extensions");
    await management.evaluate(
      async ({ id, host }) => {
        await chrome.developerPrivate.addHostPermission(id, host);
      },
      { id, host: "https://personal-vault.s3.eu-central-1.amazonaws.com/*" },
    );
    await management.close();

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const requests = [];
    let remote;
    let writes = 0;
    let rejectRead = false;
    let redirecting = false;
    let redirectResponses = 0;
    const redirectDestination =
      "https://personal-vault.s3.eu-central-1.amazonaws.com/redirect-target";
    const etag = '"controlled-object"';
    await context.route(
      "https://personal-vault.s3.eu-central-1.amazonaws.com/**",
      async (route) => {
        const request = route.request();
        const method = request.method();
        requests.push({ method, url: request.url() });
        const headers = { ETag: etag };
        assert.notEqual(
          method,
          "OPTIONS",
          "Privileged S3 requests must not need CORS preflight",
        );
        assert(
          request.headers().authorization?.includes("AWS4-HMAC-SHA256"),
          "Actual AWS SDK must sign requests",
        );
        if (redirecting && request.url() !== redirectDestination) {
          assert.equal(method, "GET");
          redirectResponses++;
          return route.fulfill({
            status: 307,
            headers: { Location: redirectDestination },
          });
        }
        if (method === "PUT") {
          assert.equal(
            request.headers()[remote ? "if-match" : "if-none-match"],
            remote ? etag : "*",
          );
          remote = request.postData();
          writes++;
          return route.fulfill({ status: 200, headers });
        }
        assert.equal(method, "GET");
        if (rejectRead) {
          rejectRead = false;
          return route.fulfill({
            status: 403,
            contentType: "application/xml",
            body: "<Error><Code>AccessDenied</Code></Error>",
          });
        }
        return remote
          ? route.fulfill({
              status: 200,
              headers,
              contentType: "application/json",
              body: remote,
            })
          : route.fulfill({
              status: 404,
              headers,
              contentType: "application/xml",
              body: "<Error><Code>NoSuchKey</Code></Error>",
            });
      },
    );
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      // Controlled missing-object and read-denial responses produce 404/403.
      if (
        ["warning", "error"].includes(message.type()) &&
        !message.text().includes("404") &&
        !message.text().includes("403") &&
        !(
          message.text().includes("net::ERR_FAILED") &&
          redirectResponses > 0 &&
          message.location().url === redirectDestination
        )
      )
        errors.push(message.text());
    });
    const log = await context.newCDPSession(page);
    await log.send("Log.enable");
    await log.send("Network.enable");
    await log.send("Network.setBlockedURLs", { urls: [redirectDestination] });
    let redirectAttempts = 0;
    log.on("Network.requestWillBeSent", ({ request }) => {
      if (request.url === redirectDestination) redirectAttempts++;
    });
    log.on("Log.entryAdded", ({ entry }) => {
      if (
        ["warning", "error"].includes(entry.level) &&
        !entry.text.includes("404") &&
        !entry.text.includes("403") &&
        !(
          entry.text.includes("net::ERR_FAILED") &&
          redirectResponses > 0 &&
          entry.url === redirectDestination
        )
      )
        errors.push(entry.text);
    });
    await page.goto(`${origin}/options.html`);
    await page
      .getByRole("heading", { name: "Set up vault", exact: true })
      .waitFor();
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const password = "orbit lantern velvet canyon river";
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByText("Strong", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
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
    const positions = (await page.locator("label").allTextContents())
      .filter((text) => /^Word \d+$/.test(text))
      .map((text) => Number(text.split(" ")[1]));
    for (const position of positions)
      await page
        .getByLabel(`Word ${position}`, { exact: true })
        .fill(words[position - 1]);
    await page
      .getByRole("button", { name: "Check words", exact: true })
      .click();
    await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
    // Keep an actual encrypted entry through sync and local password recovery.
    await page
      .getByRole("button", { name: "Add entry", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Login", { exact: true })
      .fill("recovery@example.test");
    await page
      .getByLabel("Website", { exact: true })
      .fill("https://example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("entry violet meadow lantern river");
    await page.getByText("Strong", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await page.getByRole("button", { name: "Sync", exact: true }).click();
    const downloadReady = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download S3 template" }).click();
    const template = await downloadReady;
    assert.equal(template.suggestedFilename(), "s3.template.yaml");
    assert.equal(
      fs.readFileSync(await template.path(), "utf8"),
      fs.readFileSync("providers/aws/s3.template.yaml", "utf8"),
    );
    await page.getByRole("tab", { name: "AWS Console" }).click();
    await page
      .getByRole("textbox", { name: "S3 bucket name", exact: true })
      .fill("personal-vault");
    await page
      .getByRole("textbox", { name: "S3 region", exact: true })
      .fill("eu-central-1");
    assert.equal(
      await page.getByLabel("Secret access key", { exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Allow storage access", exact: true })
      .click();
    await page
      .getByRole("note", {
        name: "Information: Browser access allowed",
        exact: true,
      })
      .waitFor();
    assert.equal(
      requests.length,
      0,
      "Browser permission must be granted before any S3 request",
    );
    await page
      .getByRole("button", {
        name: "I created this private bucket",
      })
      .click();
    assert.equal(requests.length, 0, "Setup instructions must not contact S3");
    await page
      .getByRole("button", { name: "I already have storage", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("textbox", { name: "S3 bucket name", exact: true })
        .inputValue(),
      "personal-vault",
    );
    assert.equal(
      await page
        .getByRole("textbox", { name: "S3 region", exact: true })
        .inputValue(),
      "eu-central-1",
    );
    await page
      .getByRole("button", { name: "Back to setup guide", exact: true })
      .click();
    await page
      .getByRole("button", { name: "I saved the HTTPS policy", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "I attached the scoped policy to the user",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "4. Connect vault", exact: true })
      .waitFor();
    assert(
      (
        await page
          .getByRole("region", { name: "Storage location", exact: true })
          .textContent()
      ).includes("personal-vault"),
    );
    assert.equal(
      await page.getByLabel("Secret access key", { exact: true }).count(),
      1,
    );
    await page
      .getByRole("button", { name: "Test access", exact: true })
      .click();
    await page
      .getByText("Access key ID is required.", { exact: true })
      .waitFor();
    assert.equal(
      requests.length,
      0,
      "Incomplete credentials must not contact S3",
    );
    await page
      .getByLabel("Access key ID", { exact: true })
      .fill("EXAMPLEACCESSKEYID123");
    const secret = "controlled-secret-access-key-never-a-real-key";
    await page.getByLabel("Secret access key", { exact: true }).fill(secret);
    await page
      .getByRole("button", { name: "Test access", exact: true })
      .click();
    await page.getByText(/Read access confirmed/).waitFor();
    assert.equal(writes, 0);
    rejectRead = true;
    await page
      .getByRole("button", { name: "Enable sync", exact: true })
      .click();
    await page
      .getByText(
        "AWS denied read access. Allow s3:GetObject for this bucket and object prefix.",
        { exact: true },
      )
      .waitFor();
    assert.equal(writes, 0, "A rejected setup read must not upload the vault");
    await page
      .getByRole("button", { name: "Enable sync", exact: true })
      .click();
    await page
      .getByText("The encrypted vault is up to date in S3.", { exact: true })
      .waitFor();
    assert.equal(writes, 1);
    assert(!remote.includes(secret));
    assert(!remote.includes(password));
    await page.getByRole("button", { name: "Check sync", exact: true }).click();
    await page
      .getByText("This device and S3 have the same verified vault.", {
        exact: true,
      })
      .waitFor();
    assert.equal(writes, 1);
    await page
      .getByRole("button", { name: "Replace access keys", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Secret access key", { exact: true }).inputValue(),
      "",
    );
    assert(
      await page
        .getByLabel("Bucket", { exact: true })
        .evaluate((el) => el.readOnly),
    );
    await page
      .getByLabel("Access key ID", { exact: true })
      .fill("EXAMPLEREPLACEMENT123");
    await page
      .getByLabel("Secret access key", { exact: true })
      .fill(secret + "-replacement");
    await page
      .getByRole("button", { name: "Save access keys", exact: true })
      .click();
    await page.getByText(/Access keys updated on this device\./).waitFor();
    assert.equal(writes, 1);
    await page
      .getByRole("button", { name: "Retry upload", exact: true })
      .click();
    await page
      .getByText("The encrypted vault is up to date in S3.", { exact: true })
      .waitFor();
    assert.equal(writes, 1);
    const grants = await page.evaluate(() => chrome.permissions.getAll());
    assert.deepEqual(grants.origins, [
      "https://personal-vault.s3.eu-central-1.amazonaws.com/*",
    ]);
    const requestsBeforeRevoke = requests.length;
    await page.evaluate(() =>
      chrome.permissions.remove({
        origins: ["https://personal-vault.s3.eu-central-1.amazonaws.com/*"],
      }),
    );
    await page.getByText("Storage access is needed", { exact: true }).waitFor();
    assert(
      await page
        .getByRole("button", { name: "Check sync", exact: true })
        .isDisabled(),
    );
    assert(
      await page
        .getByRole("button", { name: "Retry upload", exact: true })
        .isDisabled(),
    );
    assert.equal(requests.length, requestsBeforeRevoke);
    const restore = await context.newPage();
    await restore.goto("chrome://extensions");
    await restore.evaluate(
      async ({ id, host }) => {
        await chrome.developerPrivate.addHostPermission(id, host);
      },
      { id, host: "https://personal-vault.s3.eu-central-1.amazonaws.com/*" },
    );
    await restore.close();
    if (
      await page
        .getByRole("button", { name: "Allow storage access", exact: true })
        .isVisible()
    ) {
      await page
        .getByRole("button", { name: "Allow storage access", exact: true })
        .click();
    }
    await page
      .getByText("Storage access is needed", { exact: true })
      .waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Check sync", exact: true }).click();
    await page
      .getByText("This device and S3 have the same verified vault.", {
        exact: true,
      })
      .waitFor();
    // A same-host redirect isolates fetch redirect policy from host grants/CORS.
    redirecting = true;
    await page.getByRole("button", { name: "Check sync", exact: true }).click();
    await page
      .getByText("The sync review could not be prepared. Reopen Sync and try again.", {
        exact: true,
      })
      .waitFor();
    assert(redirectResponses > 0);
    assert.equal(
      redirectAttempts,
      0,
      "Signed S3 requests must not attempt redirects",
    );
    redirecting = false;
    await page.getByRole("button", { name: "Check sync", exact: true }).click();
    await page
      .getByText("This device and S3 have the same verified vault.", {
        exact: true,
      })
      .waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Sync", exact: true }).click();
    await page.getByText("personal-vault", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Replace access keys", exact: true })
      .click();
    await page.getByLabel("Secret access key", { exact: true }).fill(secret);
    const other = await context.newPage();
    await other.goto(`${origin}/options.html`);
    await other
      .getByRole("button", { name: "Lock vault", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Unlock vault", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Secret access key", { exact: true }).count(),
      0,
    );
    await other.close();
    await page
      .getByRole("button", { name: "Forgot password?", exact: true })
      .click();
    const artifactDir = path.resolve(".local/recovery-validation");
    fs.mkdirSync(artifactDir, { recursive: true });
    await page.screenshot({
      path: path.join(artifactDir, "recover-access.png"),
      fullPage: true,
    });
    const newPassword = "copper forest harbor ripple velvet";
    await page
      .getByLabel("Recovery phrase", { exact: true })
      .fill(Array(24).fill("abandon").join(" "));
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill(newPassword);
    await page.getByText("Strong", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Set new password", exact: true })
      .click();
    await page.getByText(/Could not recover this vault/).waitFor();
    const requestsBeforeRecovery = requests.length;
    await page
      .getByLabel("Recovery phrase", { exact: true })
      .fill(
        words
          .map((word, index) => `${index + 1}. ${word.toUpperCase()}`)
          .join("\n"),
      );
    await page
      .getByRole("button", { name: "Set new password", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Save replacement recovery words",
        exact: true,
      })
      .waitFor();
    assert.equal(
      requests.length,
      requestsBeforeRecovery,
      "Local recovery must not contact S3",
    );
    await page.screenshot({
      path: path.join(artifactDir, "replacement-words-hidden.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Reveal recovery words", exact: true })
      .click();
    const replacementWords = await page
      .locator('section[aria-label="Recovery words"] li')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.lastElementChild.textContent),
      );
    assert.equal(replacementWords.length, 24);
    assert.notDeepEqual(replacementWords, words);
    await page.getByRole("button", { name: "I saved all 24 words" }).click();
    const challenge = (await page.locator("label").allTextContents())
      .filter((text) => /^Word \d+$/.test(text))
      .map((text) => Number(text.split(" ")[1]));
    assert.equal(new Set(challenge).size, 3);
    for (const position of challenge)
      await page
        .getByLabel(`Word ${position}`, { exact: true })
        .fill(replacementWords[position - 1]);
    await page
      .getByRole("button", { name: "Check words", exact: true })
      .click();
    await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
    await page.getByText("recovery@example.test", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Sync", exact: true }).click();
    await page.getByText("personal-vault", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Check sync", exact: true }).click();
    await page
      .getByText("This device and S3 have the same verified vault.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      writes,
      1,
      "Password recovery preserves the vault and saved sync credentials",
    );
    await page
      .getByRole("button", { name: "Back to vault", exact: true })
      .click();
    await page.getByRole("button", { name: "Lock vault", exact: true }).click();
    await page.getByLabel("Vault password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByText(/Could not unlock this vault/).waitFor();
    await page.getByLabel("Vault password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
    await page.getByText("recovery@example.test", { exact: true }).waitFor();
    // Exercise the remaining application navigation with the real core graph.
    await page
      .getByRole("button", { name: "Password tools", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Generate password", exact: true })
      .click();
    const generated = await page
      .getByLabel("Generated password", { exact: true })
      .inputValue();
    assert.equal(
      await page
        .getByLabel("Generated password", { exact: true })
        .getAttribute("type"),
      "password",
    );
    await page
      .getByRole("button", { name: "Use in new entry", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Password", { exact: true }).inputValue(),
      generated,
    );
    await page.getByLabel("Login", { exact: true }).fill("tools@example.test");
    await page
      .getByLabel("Website", { exact: true })
      .fill("https://tools.example.test");
    await page.getByText("Strong", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await page.getByText("tools@example.test", { exact: true }).waitFor();
    assert.equal(
      writes,
      2,
      "Generated entry is encrypted and uploaded through the normal workspace",
    );
    await page
      .getByRole("button", { name: "Password tools", exact: true })
      .click();
    await page.getByRole("tab", { name: "Username", exact: true }).click();
    await page
      .getByRole("button", { name: "Generate username", exact: true })
      .click();
    const generatedUsername = await page
      .getByLabel("Generated username", { exact: true })
      .inputValue();
    await page
      .getByRole("button", { name: "Use in new entry", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Login", { exact: true }).inputValue(),
      generatedUsername,
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit device settings", exact: true })
      .click();
    await page
      .getByLabel("Device name", { exact: true })
      .fill("Review browser");
    await page
      .getByLabel("Lock duration on this device", { exact: true })
      .selectOption("1800000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Review browser", { exact: true }).waitFor();
    await page
      .getByRole("heading", { name: "Vault settings", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Devices", exact: true }).click();
    await page
      .getByRole("heading", { name: "Review browser", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    const settingsPassword = "glacier basket compass willow orchard";
    await page
      .getByLabel("Current password", { exact: true })
      .fill(newPassword);
    await page
      .getByLabel("New password", { exact: true })
      .fill(settingsPassword);
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill(settingsPassword);
    await page.getByText("Strong", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await page
      .getByText("Password changed for this browser.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Lock vault", exact: true }).click();
    await page.getByLabel("Vault password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByText(/Could not unlock this vault/).waitFor();
    await page
      .getByLabel("Vault password", { exact: true })
      .fill(settingsPassword);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByText("tools@example.test", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Replace recovery words", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "I can save a private copy of the replacement words now.",
      })
      .check();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Replace recovery words", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reveal recovery words", exact: true })
      .click();
    const settingsWords = await page
      .locator('section[aria-label="Recovery words"] li')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.lastElementChild.textContent),
      );
    assert.notDeepEqual(settingsWords, replacementWords);
    await page.getByRole("button", { name: "I saved all 24 words" }).click();
    const settingsPositions = (await page.locator("label").allTextContents())
      .filter((text) => /^Word \d+$/.test(text))
      .map((text) => Number(text.split(" ")[1]));
    for (const position of settingsPositions)
      await page
        .getByLabel(`Word ${position}`, { exact: true })
        .fill(settingsWords[position - 1]);
    await page
      .getByRole("button", { name: "Check words", exact: true })
      .click();
    await page.getByText("tools@example.test", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove local vault", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "I understand that recovery words alone cannot restore deleted browser data.",
      })
      .check();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove local vault", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Set up vault", exact: true })
      .waitFor();
    assert.equal(writes, 2, "Local removal must not change remote vault data");
    await page.waitForTimeout(6500);
    assert.deepEqual(errors, []);
    console.info(
      JSON.stringify({
        browser: context.browser().version(),
        writes,
        signedRequests: requests.length,
        checks: [
          "setup without CORS",
          "exact host grant",
          "real fetch rejects redirects without contacting the destination",
          "revocation pauses sync without losing the vault",
          "permission restoration",
          "read-only access test",
          "conditional first upload",
          "verified equality",
          "credential repair",
          "no redundant upload",
          "persisted target",
          "cross-page lock",
          "rejected recovery leaves the vault recoverable",
          "local password recovery replaces words",
          "three-word recovery verification",
          "entry and sync credential preservation",
          "old password rejected, new password unlocks",
          "password and username tools handoff to entries",
          "device preferences preserve settings navigation",
          "settings password change rejects old password",
          "settings recovery replacement and verification",
          "local deletion preserves remote vault and returns to setup choices",
        ],
        errors,
      }),
    );
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
