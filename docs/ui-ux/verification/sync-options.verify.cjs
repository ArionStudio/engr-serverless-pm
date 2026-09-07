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
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const requests = [];
    let remote;
    let writes = 0;
    const etag = '"controlled-object"';
    await context.route(
      "https://personal-vault.s3.eu-central-1.amazonaws.com/**",
      async (route) => {
        const request = route.request();
        const method = request.method();
        requests.push({ method, url: request.url() });
        const headers = {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET,PUT,DELETE",
          "access-control-allow-headers": "*",
          "access-control-expose-headers": "ETag",
          ETag: etag,
        };
        if (method === "OPTIONS")
          return route.fulfill({ status: 200, headers });
        assert(
          request.headers().authorization?.includes("AWS4-HMAC-SHA256"),
          "Actual AWS SDK must sign requests",
        );
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
      // The controlled missing object deliberately produces HTTP 404.
      if (
        ["warning", "error"].includes(message.type()) &&
        !message.text().includes("404")
      )
        errors.push(message.text());
    });
    const log = await context.newCDPSession(page);
    await log.send("Log.enable");
    log.on("Log.entryAdded", ({ entry }) => {
      if (
        ["warning", "error"].includes(entry.level) &&
        !entry.text.includes("404")
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
    await page
      .getByRole("button", { name: "Create vault", exact: true })
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
    await page
      .getByRole("heading", { name: "Vault ready", exact: true })
      .waitFor();
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
      .getByLabel("S3 bucket name", { exact: true })
      .fill("personal-vault");
    await page.getByLabel("S3 region", { exact: true }).fill("eu-central-1");
    await page
      .getByRole("button", {
        name: "2. Allow this extension and require HTTPS",
      })
      .click();
    const cors = JSON.parse(
      await page.getByLabel("CORS configuration", { exact: true }).inputValue(),
    );
    assert.deepEqual(cors[0].AllowedOrigins, [origin]);
    assert.equal(requests.length, 0, "Setup instructions must not contact S3");
    await page
      .getByRole("button", { name: "I already have storage", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Bucket", { exact: true }).inputValue(),
      "personal-vault",
    );
    assert.equal(
      await page.getByLabel("Region", { exact: true }).inputValue(),
      "eu-central-1",
    );
    await page
      .getByLabel("Access key ID", { exact: true })
      .fill("EXAMPLEACCESSKEYID123");
    const secret = "controlled-secret-access-key-never-a-real-key";
    await page.getByLabel("Secret access key", { exact: true }).fill(secret);
    await page
      .getByRole("button", { name: "Test access", exact: true })
      .click();
    await page.getByText(/Read access confirmed\./).waitFor();
    assert.equal(writes, 0);
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
    await page.waitForTimeout(6500);
    assert.deepEqual(errors, []);
    console.info(
      JSON.stringify({
        browser: context.browser().version(),
        writes,
        signedRequests: requests.length,
        checks: [
          "setup",
          "read-only access test",
          "conditional first upload",
          "verified equality",
          "credential repair",
          "no redundant upload",
          "persisted target",
          "cross-page lock",
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
