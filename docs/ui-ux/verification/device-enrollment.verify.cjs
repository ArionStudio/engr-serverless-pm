// Run after ext:build. Exercises two disposable unpacked Chrome profiles through
// the real UI and transport codecs with intercepted S3 responses. No live vault,
// AWS account or user profile. Browser-owned host grants bypass the headless
// permission prompt; production permissions.request and the AWS SDK stay real.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const contexts = [];
  const profiles = [];
  const errors = [];
  const requests = [];
  const storageHost = "https://personal-vault.s3.eu-central-1.amazonaws.com";
  let remote;
  let writes = 0;
  let objectUrl;
  let etag;
  async function storageResponse(route) {
    const request = route.request();
    const method = request.method();
    requests.push({ method, url: request.url() });
    assert.notEqual(
      method,
      "OPTIONS",
      "Privileged S3 requests must not need CORS preflight",
    );
    assert(
      request.headers().authorization?.includes("AWS4-HMAC-SHA256"),
      "Actual AWS SDK must sign requests",
    );
    if (objectUrl)
      assert.equal(
        new URL(request.url()).pathname,
        objectUrl,
        "Both devices must use the same vault object",
      );
    objectUrl = new URL(request.url()).pathname;
    if (method === "PUT") {
      assert.equal(
        request.headers()[remote ? "if-match" : "if-none-match"],
        remote ? etag : "*",
      );
      remote = request.postData();
      writes++;
      etag = `"controlled-object-${writes}"`;
      return route.fulfill({ status: 200, headers: { ETag: etag } });
    }
    assert.equal(method, "GET");
    return remote
      ? route.fulfill({
          status: 200,
          headers: { ETag: etag },
          contentType: "application/json",
          body: remote,
        })
      : route.fulfill({
          status: 404,
          contentType: "application/xml",
          body: "<Error><Code>NoSuchKey</Code></Error>",
        });
  }
  function expectedStorageMiss(message) {
    return (
      message.includes("404") && message.includes("Failed to load resource")
    );
  }
  const artifacts = path.resolve(".local/device-enrollment-validation");
  fs.mkdirSync(artifacts, { recursive: true });
  async function browser(label) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lfspm-device-ui-"));
    profiles.push(profile);
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROME_BINARY || "/usr/bin/google-chrome",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--no-sandbox", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1280, height: 1000 },
    });
    contexts.push(context);
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve("apps/extension/dist"),
    });
    await context.route(`${storageHost}/**`, async (route) => {
      try {
        await storageResponse(route);
      } catch (error) {
        errors.push(`${label}: controlled S3 assertion: ${error.message}`);
        await route.abort();
      }
    });
    const management = await context.newPage();
    await management.goto("chrome://extensions");
    await management.evaluate(
      async ({ id, host }) => {
        await chrome.developerPrivate.addHostPermission(id, host);
      },
      { id, host: `${storageHost}/*` },
    );
    await management.close();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
    page.on("console", (message) => {
      if (
        ["warning", "error"].includes(message.type()) &&
        !expectedStorageMiss(message.text())
      )
        errors.push(`${label}: ${message.text()}`);
    });
    const log = await context.newCDPSession(page);
    await log.send("Log.enable");
    log.on("Log.entryAdded", ({ entry }) => {
      if (
        ["warning", "error"].includes(entry.level) &&
        !expectedStorageMiss(entry.text)
      )
        errors.push(`${label}: ${entry.text}`);
    });
    await page.goto(`chrome-extension://${id}/options.html`);
    await page
      .getByRole("heading", { name: "Set up vault", exact: true })
      .waitFor();
    return page;
  }
  async function verifyRecovery(page) {
    await page
      .getByRole("button", { name: "Reveal recovery words", exact: true })
      .click();
    const words = await page
      .locator('section[aria-label="Recovery words"] li')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.lastElementChild.textContent),
      );
    assert.equal(words.length, 24);
    await page.getByRole("button", { name: "I saved all 24 words" }).click();
    const positions = (await page.locator("label").allTextContents())
      .filter((text) => /^Word \d+$/.test(text))
      .map((text) => Number(text.split(" ")[1]));
    assert.equal(positions.length, 3);
    for (const position of positions)
      await page
        .getByLabel(`Word ${position}`, { exact: true })
        .fill(words[position - 1]);
    await page
      .getByRole("button", { name: "Check words", exact: true })
      .click();
    await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
  }
  async function downloadText(page) {
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download artifact", exact: true })
      .click();
    return fs.readFileSync(await (await downloaded).path(), "utf8");
  }
  try {
    const trusted = await browser("trusted");
    await trusted
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    const password = "orbit lantern velvet canyon river";
    await trusted.getByLabel("New password", { exact: true }).fill(password);
    await trusted
      .getByLabel("Confirm password", { exact: true })
      .fill(password);
    await trusted.getByText("Strong", { exact: true }).waitFor();
    await trusted
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await trusted
      .getByLabel("Device name", { exact: true })
      .fill("Trusted laptop");
    await trusted
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await trusted
      .getByRole("button", { name: "Continue to recovery", exact: true })
      .click();
    await verifyRecovery(trusted);
    await trusted
      .getByRole("button", { name: "Add entry", exact: true })
      .first()
      .click();
    await trusted
      .getByLabel("Login", { exact: true })
      .fill("enrollment@example.test");
    await trusted
      .getByLabel("Website", { exact: true })
      .fill("https://example.test");
    await trusted
      .getByLabel("Password", { exact: true })
      .fill("entry violet meadow lantern river");
    await trusted.getByText("Strong", { exact: true }).waitFor();
    await trusted
      .getByRole("button", { name: "Add entry", exact: true })
      .click();
    await trusted.getByRole("button", { name: "Sync", exact: true }).click();
    await trusted
      .getByRole("button", { name: "I already have storage", exact: true })
      .click();
    await trusted
      .getByRole("textbox", { name: "S3 bucket name", exact: true })
      .fill("personal-vault");
    await trusted
      .getByRole("textbox", { name: "S3 region", exact: true })
      .fill("eu-central-1");
    await trusted
      .getByRole("button", { name: "Allow storage access", exact: true })
      .click();
    await trusted
      .getByRole("button", { name: "Continue to access keys", exact: true })
      .click();
    assert.equal(
      requests.length,
      0,
      "Storage setup must not contact S3 before credentials are submitted",
    );
    await trusted
      .getByLabel("Access key ID", { exact: true })
      .fill("EXAMPLEACCESSKEYID123");
    const trustedSecret = "controlled-trusted-secret-never-a-real-key";
    await trusted
      .getByLabel("Secret access key", { exact: true })
      .fill(trustedSecret);
    await trusted
      .getByRole("button", { name: "Enable sync", exact: true })
      .click();
    await trusted
      .getByText("The encrypted vault is up to date in S3.", { exact: true })
      .waitFor();
    assert.equal(writes, 1);
    await trusted.getByRole("button", { name: "Devices", exact: true }).click();
    await trusted.getByText("Trusted laptop", { exact: true }).waitFor();
    await trusted
      .getByRole("button", { name: "Add a device", exact: true })
      .click();
    const vaultId = await trusted
      .getByLabel("Vault ID", { exact: true })
      .inputValue();
    const fingerprint = await trusted
      .getByLabel("Vault fingerprint", { exact: true })
      .inputValue();
    const target = await browser("new-device");
    await target
      .getByRole("radio", { name: "Existing vault", exact: true })
      .check();
    await target.getByRole("button", { name: "Continue", exact: true }).click();
    await target.getByLabel("Vault ID", { exact: true }).fill(vaultId);
    await target
      .getByLabel("Vault fingerprint", { exact: true })
      .fill(fingerprint);
    await target.getByRole("button", { name: "Continue", exact: true }).click();
    const targetPassword = "orchid satellite silver meadow lantern";
    await target
      .getByLabel("New password", { exact: true })
      .fill(targetPassword);
    await target
      .getByLabel("Confirm password", { exact: true })
      .fill(targetPassword);
    await target.getByText("Strong", { exact: true }).waitFor();
    await target.getByRole("button", { name: "Continue", exact: true }).click();
    await target
      .getByLabel("Device name", { exact: true })
      .fill("Travel browser");
    await target
      .getByRole("button", { name: "Create access request", exact: true })
      .click();
    const request = await downloadText(target);
    const requestFingerprint = await target
      .locator('[role="note"] p.font-mono')
      .textContent();
    assert.equal(requestFingerprint.length, 64);
    await target.screenshot({
      path: path.join(artifacts, "request-access.png"),
      fullPage: true,
    });
    await trusted
      .getByRole("button", { name: "I have an access request", exact: true })
      .click();
    await trusted
      .getByRole("textbox", { name: "Enrollment artifact", exact: true })
      .fill(request);
    await trusted
      .getByRole("button", { name: "Review access request", exact: true })
      .click();
    await trusted.getByText(requestFingerprint, { exact: true }).waitFor();
    assert.equal(
      await trusted
        .getByRole("button", { name: "Approve device", exact: true })
        .isEnabled(),
      false,
    );
    await trusted
      .getByRole("checkbox", {
        name: "The request fingerprint matches my new device.",
        exact: true,
      })
      .check();
    await trusted.screenshot({
      path: path.join(artifacts, "approve-device.png"),
      fullPage: true,
    });
    await trusted
      .getByRole("button", { name: "Approve device", exact: true })
      .click();
    const approval = await downloadText(trusted);
    await target
      .getByRole("button", { name: "I have the approval", exact: true })
      .click();
    await target
      .getByRole("textbox", { name: "Enrollment artifact", exact: true })
      .fill(approval);
    await target
      .getByLabel("Password chosen for this device", { exact: true })
      .fill(targetPassword);
    assert.equal(
      await target.getByLabel("Access key ID", { exact: true }).count(),
      0,
    );
    const requestsBeforeVerification = requests.length;
    await target
      .getByRole("button", { name: "Verify approval", exact: true })
      .click();
    await target
      .getByRole("region", { name: "S3 access for this browser", exact: true })
      .waitFor();
    assert.equal(
      requests.length,
      requestsBeforeVerification,
      "Approval verification must not contact S3",
    );
    assert.equal(
      await target
        .getByRole("textbox", { name: "Bucket", exact: true })
        .count(),
      0,
      "Verified storage location must not be editable",
    );
    await target.getByText("personal-vault", { exact: true }).waitFor();
    await target
      .getByLabel("Access key ID", { exact: true })
      .fill("EXAMPLEDEVICEACCESS123");
    const targetSecret = "controlled-device-secret-never-a-real-key";
    await target
      .getByLabel("Secret access key", { exact: true })
      .fill(targetSecret);
    await target
      .getByRole("button", { name: "Connect vault", exact: true })
      .click();
    await verifyRecovery(target);
    assert(
      requests.length > requestsBeforeVerification,
      "Enrollment must check the approved vault against S3",
    );
    assert(
      writes >= 3,
      "Initial sync, approval, and device consumption must be uploaded",
    );
    for (const secret of [
      password,
      targetPassword,
      trustedSecret,
      targetSecret,
      "entry violet meadow lantern river",
    ])
      assert(
        !remote.includes(secret),
        "The remote object must not contain plaintext secrets",
      );
    await target
      .getByText("enrollment@example.test", { exact: true })
      .waitFor();
    await target.getByRole("button", { name: "Devices", exact: true }).click();
    await target.getByText("Travel browser", { exact: true }).waitFor();
    await target.getByText("Trusted laptop", { exact: true }).waitFor();
    assert.equal(
      await target.getByText("This device", { exact: true }).count(),
      1,
    );
    await target.screenshot({
      path: path.join(artifacts, "connected-devices.png"),
      fullPage: true,
    });
    for (const page of [trusted, target]) {
      const typography = await page.evaluate(() => ({
        font: getComputedStyle(document.body).fontFamily,
        size: getComputedStyle(document.body).fontSize,
      }));
      assert(typography.font.includes("Figtree"));
      assert.equal(typography.size, "16px");
      await page.setViewportSize({ width: 440, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await target.screenshot({
      path: path.join(artifacts, "connected-devices-narrow.png"),
      fullPage: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 6500));
    assert.deepEqual(errors, []);
    process.stdout.write(
      JSON.stringify(
        {
          browser: contexts[0].browser().version(),
          writes,
          signedRequests: requests.length,
          checks: [
            "two disposable unpacked Chrome profiles",
            "mandatory S3 configured before enrollment",
            "signed conditional S3 requests intercepted without a real AWS account",
            "approval verification reveals immutable S3 location before credentials",
            "request fingerprint matched before explicit approval",
            "encrypted approval exported and imported",
            "new-device password and three-word recovery verification",
            "existing entry readable on newly enrolled device",
            "current device identified",
            "Figtree 16px and narrow layout",
            "no runtime or preload warnings",
          ],
          errors,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    for (const profile of profiles)
      fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
