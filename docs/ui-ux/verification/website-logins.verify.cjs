// Run from the repository root after ext:build:all. Uses a disposable profile
// and controlled HTTPS responses. PLAYWRIGHT_MODULE may point at an existing installation.
// Browser-owned permission grants prime the test; permissions.request is still exercised.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  fs.mkdirSync(".local/login-validation", { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lfspm-login-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/bin/google-chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--no-sandbox", "--enable-unsafe-extension-debugging"],
    viewport: { width: 1280, height: 1000 },
  });
  let page;
  const errors = [];
  const monitors = [];
  context.on("page", (target) => {
    target.on("pageerror", (error) => errors.push(error.message));
    target.on("console", (message) => {
      if (
        ["warning", "error"].includes(message.type()) &&
        !target.url().startsWith("chrome://")
      )
        errors.push(`console ${message.type()}: ${message.text()}`);
    });
    monitors.push(
      context.newCDPSession(target).then(async (log) => {
        log.on("Log.entryAdded", ({ entry }) => {
          if (
            ["warning", "error"].includes(entry.level) &&
            !target.url().startsWith("chrome://")
          )
            errors.push(`log ${entry.level}: ${entry.text}`);
        });
        await log.send("Log.enable");
      }),
    );
  });
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve("apps/extension/dist"),
    });
    const origin = `chrome-extension://${id}`;
    page = await context.newPage();
    page.setDefaultTimeout(20000);
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
      .fill("Disposable login check");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Continue to recovery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reveal recovery words", exact: true })
      .click();
    const words = await page
      .locator('section[aria-label="Recovery words"] li')
      .evaluateAll((ns) => ns.map((n) => n.lastElementChild.textContent));
    await page.getByRole("button", { name: "I saved all 24 words" }).click();
    const labels = (await page.locator("label").allTextContents()).filter((t) =>
      /^Word \d+$/.test(t),
    );
    for (const label of labels)
      await page
        .getByLabel(label, { exact: true })
        .fill(words[Number(label.split(" ")[1]) - 1]);
    await page
      .getByRole("button", { name: "Check words", exact: true })
      .click();
    await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
    console.log("Vault created through real setup");
    const management = await context.newPage();
    await management.goto("chrome://extensions");
    await management.evaluate(async (id) => {
      for (const host of [
        "https://*/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
        "http://[::1]/*",
      ])
        await chrome.developerPrivate.addHostPermission(id, host);
    }, id);
    await management.close();
    await page.evaluate(async () => {
      await chrome.permissions.request({
        origins: [
          "https://*/*",
          "http://localhost/*",
          "http://127.0.0.1/*",
          "http://[::1]/*",
        ],
      });
      await chrome.storage.local.set({ loginDetectionEnabled: true });
      await chrome.scripting.registerContentScripts([
        {
          id: "lfspm-login-detection",
          js: ["login-content.js"],
          matches: ["https://*/*"],
          runAt: "document_idle",
        },
      ]);
    });
    const form =
      '<!doctype html><html><title>Local controlled login</title><body><form method="post" action="/done"><label>Username<input name="username" autocomplete="username"></label><label>Password<input name="password" type="password" autocomplete="current-password"></label><button type="submit">Sign in</button></form></body></html>';
    const reactivePasswordForm =
      '<!doctype html><html><title>Reactive password login</title><body><form method="post" action="/done"><h1>Sign in</h1><label>Password<input name="password" type="password" autocomplete="current-password"></label><button type="submit">Sign in</button></form><script>const password=document.querySelector("input");password.addEventListener("input",()=>{const replacement=password.cloneNode();replacement.value=password.value;replacement.dataset.reactiveReplacement="true";password.replaceWith(replacement)},{once:true})</script></body></html>';
    const failedFillForm =
      '<!doctype html><html><title>Changing login form</title><body><form method="post" action="/done"><h1>Sign in</h1><label>Username<input name="username" autocomplete="username"></label><label>Password<input name="password" type="password" autocomplete="current-password" value="user-entered-new-secret"></label><button type="submit">Sign in</button></form><script>document.querySelector("input[name=username]").addEventListener("input",()=>{const form=document.querySelector("form");form.addEventListener("submit",event=>event.preventDefault(),{once:true});form.requestSubmit();form.action="https://other.example/login"},{once:true})</script></body></html>';
    await context.route("https://example.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: route.request().url().includes("/done")
          ? "<html><body>Signed in</body></html>"
          : route.request().url().includes("/magic")
            ? `<html><body><form><h1>Sign in</h1><label>Email<input type="email" name="email"></label><div role="button" tabindex="0" onclick="location.href='/done'">Send sign-in link</div></form></body></html>`
            : route.request().url().includes("/reactive")
              ? reactivePasswordForm
              : route.request().url().includes("/failed-fill")
                ? failedFillForm
                : form,
      }),
    );
    const site = await context.newPage();
    await site.goto("https://example.com/login");
    await site.getByLabel("Username").fill("alex@example.com");
    await site.getByLabel("Password").fill("violet harbor timber prism meadow");
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done*");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).some((k) =>
        k.startsWith("lfspm.captured-login."),
      ),
    );
    const sessionData = await page.evaluate(() =>
      chrome.storage.session.get(null),
    );
    assert(
      !JSON.stringify(sessionData).includes(
        "violet harbor timber prism meadow",
      ),
    );
    console.log("Trusted submit captured; password encrypted in storage");

    async function openToolbar() {
      await site.bringToFront();
      await page.evaluate(() => chrome.action.openPopup());
      const targets = await cdp.send("Target.getTargets");
      const target = targets.targetInfos.find(
        (t) => t.url === origin + "/popup.html",
      );
      assert(target);
      const { sessionId } = await cdp.send("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: false,
      });
      let seq = 0;
      const pending = new Map();
      cdp.on("Target.receivedMessageFromTarget", (event) => {
        if (event.sessionId !== sessionId) return;
        const response = JSON.parse(event.message);
        if (
          response.method === "Log.entryAdded" &&
          ["warning", "error"].includes(response.params.entry.level)
        )
          errors.push(`popup log: ${response.params.entry.text}`);
        if (response.method === "Runtime.exceptionThrown")
          errors.push(
            `popup exception: ${response.params.exceptionDetails.text}`,
          );
        if (
          response.method === "Runtime.consoleAPICalled" &&
          ["warning", "error"].includes(response.params.type)
        )
          errors.push(
            `popup console: ${response.params.args.map((value) => value.value ?? value.description).join(" ")}`,
          );
        const done = pending.get(response.id);
        if (done) {
          pending.delete(response.id);
          response.error
            ? done.reject(new Error(response.error.message))
            : done.resolve(response.result);
        }
      });
      const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++seq;
          pending.set(id, { resolve, reject });
          cdp
            .send("Target.sendMessageToTarget", {
              sessionId,
              message: JSON.stringify({ id, method, params }),
            })
            .catch(reject);
        });
      await send("Log.enable");
      await send("Runtime.enable");
      const evaluate = async (expression) => {
        const result = await send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails)
          throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      const wait = async (text) => {
        for (let i = 0; i < 100; i++) {
          if ((await evaluate("document.body.innerText")).includes(text))
            return;
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error(
          "Popup missing " +
            text +
            ": " +
            (await evaluate("document.body.innerText")),
        );
      };
      const click = async (name) => {
        await wait(name);
        for (let i = 0; i < 100; i++) {
          if (
            await evaluate(
              `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(name)} && !b.disabled)`,
            )
          )
            break;
          await new Promise((r) => setTimeout(r, 100));
        }
        await evaluate(
          `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(name)} && !b.disabled).click()`,
        );
      };
      const screenshot = async (name) => {
        const result = await send("Page.captureScreenshot");
        fs.writeFileSync(
          ".local/login-validation/" + name + ".png",
          Buffer.from(result.data, "base64"),
        );
      };
      return {
        evaluate,
        wait,
        click,
        screenshot,
        close: () =>
          cdp.send("Target.closeTarget", { targetId: target.targetId }),
      };
    }
    const popup = await openToolbar();
    await popup.click("Detected");
    await popup.wait("Save this login?");
    await popup.screenshot("captured-popup");
    await popup.click("Review new login");
    await popup.wait("Add entry");
    assert.equal(
      await popup.evaluate(
        `document.querySelector('input[autocomplete="username"]').value`,
      ),
      "alex@example.com",
    );
    await popup.wait("Strong");
    await popup.evaluate(
      `(() => { const input = document.querySelector('input[type="password"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'weak'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await popup.wait("Save with this weak password");
    await popup.evaluate(
      `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Add entry').scrollIntoView({block:'end'})`,
    );
    await popup.click("Add entry");
    await popup.wait("Use a strong password");
    assert.equal(
      await popup.evaluate(
        `document.activeElement.matches('input[aria-invalid="true"]')`,
      ),
      true,
    );
    assert.equal(
      await popup.evaluate(
        `(() => { const field = document.activeElement.getBoundingClientRect(); const area = document.querySelector('[data-focus-target]').getBoundingClientRect(); return field.top >= area.top && field.bottom <= area.bottom; })()`,
      ),
      true,
    );
    await popup.screenshot("weak-password-focus");
    await popup.evaluate(
      `(() => { const input = document.querySelector('input[type="password"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'violet harbor timber prism meadow'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await popup.wait("Strong");
    await popup.screenshot("review-editor");
    await popup.click("Add entry");
    await popup.wait("No login waiting to be saved");
    await popup.close();
    await site.goto("https://example.com/login");
    const filling = await openToolbar();
    await filling.click("Fill");
    await filling.wait("Login filled.");
    assert.equal(
      await site.getByLabel("Username").inputValue(),
      "alex@example.com",
    );
    assert.equal(
      await site.getByLabel("Password").inputValue(),
      "violet harbor timber prism meadow",
    );
    assert.equal(new URL(site.url()).pathname, "/login");
    await filling.screenshot("filled-popup");
    await filling.click("Settings");
    await filling.wait("Appearance");
    await filling.click("Dark");
    assert.equal(
      await filling.evaluate(`localStorage.getItem('spm-theme')`),
      "dark",
    );
    await filling.screenshot("popup-settings");
    await filling.close();
    console.log(
      "Review saved actual entry; explicit fill populated fields without submitting",
    );
    await site
      .getByLabel("Password")
      .fill("cobalt forest marble lantern summit");
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).some((k) =>
        k.startsWith("lfspm.captured-login."),
      ),
    );
    const update = await openToolbar();
    await update.click("Detected");
    await update.click("Review update");
    await update.wait("Strong");
    await update.click("Save entry");
    await update.wait("No login waiting to be saved");
    await update.close();
    await site.goto("https://example.com/login");
    let updated = await openToolbar();
    await updated.click("Fill");
    await updated.wait("Login filled.");
    assert.equal(
      await site.getByLabel("Password").inputValue(),
      "cobalt forest marble lantern summit",
    );
    await updated.close();
    await site.goto("https://example.com/reactive");
    const reactiveFill = await openToolbar();
    await reactiveFill.click("Fill");
    await reactiveFill.wait("Login filled.");
    assert.equal(
      await site.getByLabel("Password").inputValue(),
      "cobalt forest marble lantern summit",
    );
    assert.equal(await site.locator("[data-reactive-replacement]").count(), 1);
    await reactiveFill.close();
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done");
    await site.waitForTimeout(500);
    assert.equal(
      await page.evaluate(
        async () =>
          Object.keys(await chrome.storage.session.get(null)).filter((key) =>
            key.startsWith("lfspm.captured-login."),
          ).length,
      ),
      0,
    );
    console.log(
      "Reactive password replacement did not recapture a filled login",
    );
    await site.goto("https://example.com/failed-fill");
    await site.getByLabel("Username").click();
    const failedFill = await openToolbar();
    await failedFill.click("Fill");
    await failedFill.wait(
      "Could not fill this login. Reopen the page and try again.",
    );
    assert.equal(
      await site.getByLabel("Password").inputValue(),
      "user-entered-new-secret",
    );
    await site.waitForTimeout(500);
    assert.equal(
      await page.evaluate(
        async () =>
          Object.keys(await chrome.storage.session.get(null)).filter((key) =>
            key.startsWith("lfspm.captured-login."),
          ).length,
      ),
      0,
    );
    await failedFill.close();
    await site.evaluate(() => {
      document.querySelector("form").action = "/done";
    });
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).some((key) =>
        key.startsWith("lfspm.captured-login."),
      ),
    );
    const failedFillReview = await openToolbar();
    await failedFillReview.click("Detected");
    await failedFillReview.click("Dismiss");
    await failedFillReview.wait("No login waiting to be saved");
    await failedFillReview.close();
    console.log(
      "Failed fill suppressed reentrant submission and preserved later user capture",
    );
    await site.goto("https://example.com/login");
    const changedAccountFill = await openToolbar();
    await changedAccountFill.click("Fill");
    await changedAccountFill.wait("Login filled.");
    await changedAccountFill.close();
    await site.getByLabel("Username").fill("other@example.com");
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).some((key) =>
        key.startsWith("lfspm.captured-login."),
      ),
    );
    const changedAccountReview = await openToolbar();
    await changedAccountReview.click("Detected");
    await changedAccountReview.wait("other@example.com");
    await changedAccountReview.wait("Review new login");
    await changedAccountReview.click("Dismiss");
    await changedAccountReview.wait("No login waiting to be saved");
    await changedAccountReview.close();
    console.log(
      "Trusted username edit after fill produces a new login proposal",
    );
    await site.goto("https://example.com/magic");
    await site.getByLabel("Email").fill("link@example.com");
    await site.getByRole("button", { name: "Send sign-in link" }).click();
    await site.waitForURL("**/done");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).some((k) =>
        k.startsWith("lfspm.captured-login."),
      ),
    );
    const emailReview = await openToolbar();
    await emailReview.click("Detected");
    await emailReview.wait("Save this email sign-in?");
    await emailReview.screenshot("email-link-capture");
    await emailReview.click("Review new login");
    await emailReview.wait("This account uses an email sign-in link");
    assert.equal(
      await emailReview.evaluate(
        `document.querySelector('input[type="password"]') === null`,
      ),
      true,
    );
    await emailReview.screenshot("email-link-editor");
    await emailReview.click("Add entry");
    await emailReview.wait("No login waiting to be saved");
    await emailReview.close();
    await site.goto("https://example.com/magic");
    const emailFill = await openToolbar();
    await emailFill.wait("Email or username step detected");
    await emailFill.evaluate(
      `Array.from(document.querySelectorAll('li')).find(li => li.textContent.includes('link@example.com') && Array.from(li.querySelectorAll('button')).some(b => b.textContent.trim() === 'Fill')).querySelector('button').click()`,
    );
    await emailFill.wait("Login filled.");
    assert.equal(
      await site.getByLabel("Email").inputValue(),
      "link@example.com",
    );
    await emailFill.evaluate(
      `document.querySelector('[aria-label="Lock vault"]').click()`,
    );
    await emailFill.wait("Unlock vault");
    await emailFill.evaluate(
      `(() => { const input = document.querySelector('input[type="password"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'orbit lantern velvet canyon river'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await emailFill.click("Unlock vault");
    await emailFill.wait("link@example.com");
    await emailFill.close();
    await site.getByRole("button", { name: "Send sign-in link" }).click();
    await site.waitForURL("**/done");
    assert.equal(
      await page.evaluate(
        async () =>
          Object.keys(await chrome.storage.session.get(null)).filter((k) =>
            k.startsWith("lfspm.captured-login."),
          ).length,
      ),
      0,
    );
    console.log(
      "Email-link capture, review, persistence after unlock, explicit fill and duplicate suppression passed",
    );
    await context.route("https://account.example.org/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Account home</body></html>",
      }),
    );
    await site.goto("https://example.com/login");
    const retention = await openToolbar();
    await retention.click("Detected");
    await retention.wait("Keep detected login across page changes");
    await retention.evaluate(
      `Array.from(document.querySelectorAll('label')).find(label => label.textContent.includes('Keep detected login across page changes')).querySelector('[role="switch"]').click()`,
    );
    await page.waitForFunction(
      async () =>
        (await chrome.storage.local.get("capturedLoginSessionRetention"))
          .capturedLoginSessionRetention === true,
    );
    await retention.close();
    await site.getByLabel("Username").fill("redirect@example.com");
    await site
      .getByLabel("Password")
      .fill("meadow granite velvet orbit canyon");
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done*");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).some((key) =>
        key.startsWith("lfspm.captured-login."),
      ),
    );
    await site.goto("https://account.example.org/home");
    let retained = await openToolbar();
    await retained.click("Detected");
    await retained.wait("redirect@example.com");
    assert.equal(
      await retained.evaluate(
        `Array.from(document.querySelectorAll('p')).some(p => p.textContent.trim() === 'example.com')`,
      ),
      true,
    );
    await retained.screenshot("retained-after-redirect");
    await retained.click("Review new login");
    await retained.wait("Add entry");
    await retained.evaluate(
      `(() => { const input = document.querySelector('input[autocomplete="username"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'edited-redirect@example.com'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await retained.click("Add entry");
    await retained.wait("No login waiting to be saved");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).every(
        (key) => !key.startsWith("lfspm.captured-login."),
      ),
    );
    await retained.close();
    await site.goto("https://example.com/login");
    await site.getByLabel("Username").fill("lock-cleanup@example.com");
    await site
      .getByLabel("Password")
      .fill("meadow granite velvet orbit canyon");
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done*");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).some((key) =>
        key.startsWith("lfspm.captured-login."),
      ),
    );
    retained = await openToolbar();
    await retained.click("Detected");
    await retained.wait("lock-cleanup@example.com");
    await retained.evaluate(
      `document.querySelector('[aria-label="Lock vault"]').click()`,
    );
    await retained.wait("Unlock vault");
    await page.waitForFunction(async () =>
      Object.keys(await chrome.storage.session.get(null)).every(
        (key) => !key.startsWith("lfspm.captured-login."),
      ),
    );
    await retained.evaluate(
      `(() => { const input = document.querySelector('input[type="password"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'orbit lantern velvet canyon river'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await retained.click("Unlock vault");
    await retained.click("Detected");
    await retained.wait("No login waiting to be saved");
    await retained.close();
    console.log(
      "Session retention survives redirects; edited save and vault lock clear their captures",
    );
    await site.goto("https://example.com/login");
    updated = await openToolbar();
    await updated.click("Detected");
    await updated.wait("Login detection");
    await updated.evaluate(`document.querySelector('[role="switch"]').click()`);
    await updated.wait("Off");
    await updated.close();
    await site.getByLabel("Password").fill("unused disabled capture password");
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL("**/done");
    assert.equal(
      await page.evaluate(
        async () =>
          Object.keys(await chrome.storage.session.get(null)).filter((k) =>
            k.startsWith("lfspm.captured-login."),
          ).length,
      ),
      0,
    );
    console.log("Password update and detection-off checks passed");

    await Promise.all(monitors);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    assert.deepEqual(errors, []);
    console.log("PASS");
  } catch (e) {
    if (page) {
      console.error((await page.locator("body").innerText()).slice(0, 2000));
      await page.screenshot({ path: ".local/login-validation/failure.png" });
    }
    throw e;
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
