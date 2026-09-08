// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fillLogin,
  findLoginFields,
  isAllowedLoginUrl,
  readSubmittedLogin,
} from "./login-dom";

describe("login DOM boundary", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/login");
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 200, 30),
    ] as unknown as DOMRectList);
    document.body.innerHTML =
      '<form><input name="username" autocomplete="username"><input name="password" type="password" autocomplete="current-password"><button>Log in</button></form>';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("fills one visible login form through native setters and input events without submitting", () => {
    const input =
      document.querySelector<HTMLInputElement>('[name="username"]')!;
    const password =
      document.querySelector<HTMLInputElement>('[type="password"]')!;
    const changed = vi.fn();
    const submitted = vi.fn();
    password.addEventListener("input", changed);
    document.querySelector("form")!.addEventListener("submit", submitted);
    expect(fillLogin(document, "alice", "example-password")).toBe(true);
    expect(input.value).toBe("alice");
    expect(password.value).toBe("example-password");
    expect(changed).toHaveBeenCalledOnce();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("reports failed email fill when a page handler clears the value", () => {
    document.body.innerHTML =
      '<form><h1>Sign in</h1><label>Email<input type="email"></label><button>Send sign-in link</button></form>';
    const email = document.querySelector("input")!;
    email.addEventListener("input", () => {
      email.value = "";
    });
    expect(fillLogin(document, "alice@example.com", "")).toBe(false);
    expect(email.value).toBe("");
  });

  it("refuses insecure destinations, cross-origin actions and submit overrides", () => {
    expect(isAllowedLoginUrl("http://example.com/login")).toBe(false);
    expect(isAllowedLoginUrl("https://example.com/login")).toBe(true);
    expect(isAllowedLoginUrl("http://localhost/login")).toBe(true);
    expect(isAllowedLoginUrl("http://localhost:443@evil.example/login")).toBe(
      false,
    );
    document.querySelector("form")!.action = "https://other.example/login";
    expect(fillLogin(document, "alice", "secret")).toBe(false);
    document.querySelector("form")!.action = location.href;
    document
      .querySelector("button")!
      .setAttribute("formaction", "https://other.example/login");
    expect(fillLogin(document, "alice", "secret")).toBe(false);
  });

  it("does not fill hidden, disabled, readonly, new-password or ambiguous forms", () => {
    const password =
      document.querySelector<HTMLInputElement>('[type="password"]')!;
    for (const attribute of ["hidden", "disabled", "readonly"]) {
      password.setAttribute(attribute, "");
      expect(fillLogin(document, "alice", "secret")).toBe(false);
      password.removeAttribute(attribute);
    }
    password.autocomplete = "new-password";
    expect(fillLogin(document, "alice", "secret")).toBe(false);
    password.autocomplete = "current-password";
    const form = document.querySelector("form")!;
    document.body.append(form.cloneNode(true));
    expect(fillLogin(document, "alice", "secret")).toBe(false);
    password.focus();
    expect(fillLogin(document, "alice", "secret")).toBe(true);
    expect(
      document.querySelectorAll<HTMLInputElement>('[type="password"]')[1].value,
    ).toBe("");
  });

  it("does not fill password creation or ambiguous password-only steps", () => {
    for (const [heading, kind] of [
      ["Choose a password", "registration"],
      ["Create your password", "registration"],
      ["Set a new password", "password-change"],
      ["New password", "registration"],
      ["Confirm password", "registration"],
    ] as const) {
      document.body.innerHTML = `<form><h1>${heading}</h1><input type="password" value="chosen-secret"><button>Continue</button></form>`;
      expect(findLoginFields(document, "inspect")?.description.kind).toBe(kind);
      expect(fillLogin(document, "", "saved-secret")).toBe(false);
      expect(document.querySelector<HTMLInputElement>("input")!.value).toBe(
        "chosen-secret",
      );
      expect(readSubmittedLogin(document)).toEqual({
        login: "",
        password: "chosen-secret",
      });
    }

    document.body.innerHTML =
      '<form><h1>Password</h1><input type="password" value="page-secret"><button>Continue</button></form>';
    expect(fillLogin(document, "", "saved-secret")).toBe(false);
    expect(readSubmittedLogin(document)).toBeUndefined();
  });

  it("fills and captures a password-only step with explicit sign-in or current-password evidence", () => {
    document.body.innerHTML =
      '<form><h1>Sign in</h1><input type="password" value="page-secret"><button>Continue</button></form>';
    expect(readSubmittedLogin(document)).toEqual({
      login: "",
      password: "page-secret",
    });
    expect(fillLogin(document, "", "saved-secret")).toBe(true);
    expect(document.querySelector<HTMLInputElement>("input")!.value).toBe(
      "saved-secret",
    );

    document.body.innerHTML =
      '<form><h1>Password</h1><input type="password" autocomplete="current-password" value="current-secret"><button>Continue</button></form>';
    expect(readSubmittedLogin(document)).toEqual({
      login: "",
      password: "current-secret",
    });
    expect(fillLogin(document, "", "saved-secret")).toBe(true);
  });

  it("does not capture the old password on a password-change verification step", () => {
    document.body.innerHTML =
      '<form><h1>Change password</h1><input type="password" autocomplete="current-password" value="old-secret"><button>Continue</button></form>';
    expect(findLoginFields(document, "inspect")?.description.kind).toBe(
      "password-change",
    );
    expect(readSubmittedLogin(document)).toBeUndefined();
  });

  it("rechecks the form after page input handlers before exposing the password", () => {
    document
      .querySelector('[name="username"]')!
      .addEventListener("input", () => {
        document.querySelector("form")!.action = "https://other.example/login";
      });
    expect(fillLogin(document, "alice", "secret")).toBe(false);
    expect(
      document.querySelector<HTMLInputElement>('[type="password"]')!.value,
    ).toBe("");
  });

  it("reads consistent new passwords for review, rejecting mismatches and unrelated submissions", () => {
    document.body.innerHTML =
      '<form id="login"><input autocomplete="username" value="alice"><input type="password" autocomplete="current-password" value="old"><input type="password" autocomplete="new-password" value="new"><input type="password" autocomplete="new-password" value="new"></form><form id="search"><input></form>';
    expect(
      readSubmittedLogin(document, document.querySelector("#login")!),
    ).toEqual({ login: "alice", password: "new" });
    expect(
      readSubmittedLogin(document, document.querySelector("#search")!),
    ).toBeUndefined();
    document.querySelectorAll<HTMLInputElement>(
      '[autocomplete="new-password"]',
    )[1].value = "mismatch";
    expect(readSubmittedLogin(document)).toBeUndefined();
  });

  it("detects a formless login in an open shadow root without touching OTP inputs", () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      '<input autocomplete="username"><input type="password" autocomplete="current-password"><input autocomplete="one-time-code" value="123456">';
    document.body.append(host);
    expect(findLoginFields(document, "fill")).toBeDefined();
    expect(fillLogin(document, "alice", "secret")).toBe(true);
    expect(
      shadow.querySelector<HTMLInputElement>('[autocomplete="one-time-code"]')!
        .value,
    ).toBe("123456");
  });
  it("recognizes an email-link step and a dynamically revealed password form using labels", () => {
    document.body.innerHTML =
      '<form><label for="identity">Email address</label><input id="identity"><div role="button" tabindex="0">Send sign-in link</div></form>';
    expect(findLoginFields(document, "inspect")?.description).toEqual({
      kind: "identifier",
      fields: ["email"],
    });
    expect(fillLogin(document, "alice@example.com", "")).toBe(true);
    expect(
      readSubmittedLogin(document, document.querySelector('[role="button"]')!),
    ).toEqual({ login: "alice@example.com", password: "" });
    document
      .querySelector("form")!
      .insertAdjacentHTML(
        "beforeend",
        '<label for="secret">Password</label><input id="secret" type="password"><button>Sign in</button>',
      );
    expect(findLoginFields(document, "inspect")?.description.kind).toBe(
      "sign-in",
    );
    expect(fillLogin(document, "alice@example.com", "secret")).toBe(true);
    expect(readSubmittedLogin(document)).toEqual({
      login: "alice@example.com",
      password: "secret",
    });
  });

  it("ignores controls disabled by a fieldset while preserving the first legend exception", () => {
    document.body.innerHTML =
      '<form><fieldset disabled><input autocomplete="username"><input type="password" autocomplete="current-password"></fieldset><button>Log in</button></form>';
    expect(fillLogin(document, "alice", "secret")).toBe(false);
    expect(
      Array.from(
        document.querySelectorAll<HTMLInputElement>("input"),
        (input) => input.value,
      ),
    ).toEqual(["", ""]);

    document.body.innerHTML =
      '<form><fieldset disabled><legend><input autocomplete="username"><input type="password" autocomplete="current-password"></legend></fieldset><button>Log in</button></form>';
    expect(fillLogin(document, "alice", "secret")).toBe(true);
    expect(
      Array.from(
        document.querySelectorAll<HTMLInputElement>("input"),
        (input) => input.value,
      ),
    ).toEqual(["alice", "secret"]);
  });

  it("distinguishes registration and password changes and never fills saved secrets into them", () => {
    document.body.innerHTML =
      '<form><label>Email<input type="email"></label><input type="password" aria-label="Password" value="new"><input type="password" aria-label="Repeat password" value="new"><button>Create account</button></form>';
    expect(findLoginFields(document, "inspect")?.description).toEqual({
      kind: "registration",
      fields: ["email", "new-password", "confirm-password"],
    });
    expect(fillLogin(document, "alice", "old-secret")).toBe(false);
    expect(readSubmittedLogin(document)?.password).toBe("new");
    document
      .querySelector("form")!
      .insertAdjacentHTML(
        "afterbegin",
        '<input type="password" autocomplete="current-password" value="old">',
      );
    expect(findLoginFields(document, "inspect")?.description.kind).toBe(
      "password-change",
    );
    expect(readSubmittedLogin(document)?.password).toBe("new");
    expect(fillLogin(document, "alice", "old-secret")).toBe(false);
  });

  it("does not mistake newsletter, search or verification forms for email-first authentication", () => {
    for (const html of [
      '<form><h1>Newsletter</h1><input type="email"><button>Subscribe</button></form>',
      '<form><h1>Sign in</h1><input name="search"><button>Search</button></form>',
      '<form><h1>Sign in</h1><input autocomplete="one-time-code" aria-label="Email verification code"><button>Continue</button></form>',
    ]) {
      document.body.innerHTML = html;
      expect(findLoginFields(document, "inspect")).toBeUndefined();
      expect(fillLogin(document, "alice", "secret")).toBe(false);
    }
  });
  it("captures only the email for a magic-link action, even when a password field is present", () => {
    document.body.innerHTML =
      '<form><h1>Sign in</h1><input type="email" value="alice@example.com"><button id="link">Send sign-in link</button><input type="password" value="existing-secret"><button id="password">Sign in</button></form>';
    expect(
      readSubmittedLogin(document, document.querySelector("#link")!),
    ).toEqual({ login: "alice@example.com", password: "" });
    expect(
      readSubmittedLogin(document, document.querySelector("#password")!),
    ).toEqual({ login: "alice@example.com", password: "existing-secret" });
    document.querySelector("input[type=password]")!.remove();
    document.querySelector("#link")!.textContent = "Next";
    expect(
      readSubmittedLogin(document, document.querySelector("#link")!),
    ).toBeUndefined();
  });
});
