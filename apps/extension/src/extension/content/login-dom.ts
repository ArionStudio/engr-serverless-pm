import type { BrowserLoginForm } from "@lfspm/core";
import { browserLoginPageOrigin } from "../../adapters/browser-login/browser-login-url";

const emailLinkAction =
  /\b(?:magic|sign[ -]?in|log[ -]?in)[ -]?link\b|\b(?:email|send)(?: me)? (?:a |the )?link\b/i;
const signInContext = /\b(?:sign[ -]?in|log[ -]?in)\b/i;
const freshPasswordContext =
  /\b(?:choose|create|set|confirm)(?: (?:a|the|your|new)){0,2} password\b|\bnew password\b/i;

/** DOM access stays in the isolated content script. No credentials enter page messages. */
export interface LoginFields {
  login: HTMLInputElement | undefined;
  password: HTMLInputElement | undefined;
  description: BrowserLoginForm;
  passwords: HTMLInputElement[];
  form: HTMLFormElement | null;
}

export function isAllowedLoginUrl(url: string): boolean {
  return browserLoginPageOrigin(url) !== null;
}

export function isEmailLinkAction(value: string): boolean {
  return emailLinkAction.test(value);
}

function inputsWithin(root: Document | ShadowRoot): HTMLInputElement[] {
  const inputs = Array.from(root.querySelectorAll("input"));
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) inputs.push(...inputsWithin(element.shadowRoot));
  }
  return inputs;
}

function parentElement(element: Element): Element | null {
  return (
    element.parentElement ??
    (element.getRootNode() instanceof ShadowRoot
      ? (element.getRootNode() as ShadowRoot).host
      : null)
  );
}

function usable(input: HTMLInputElement): boolean {
  if (
    input.matches(":disabled") ||
    input.readOnly ||
    input.type === "hidden" ||
    !input.isConnected ||
    input.getClientRects().length === 0
  )
    return false;
  for (
    let element: Element | null = input;
    element;
    element = parentElement(element)
  ) {
    const style = getComputedStyle(element);
    if (
      element.hasAttribute("hidden") ||
      element.hasAttribute("inert") ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      Number.parseFloat(style.opacity) === 0
    )
      return false;
  }
  return true;
}

function autocomplete(input: HTMLInputElement): string[] {
  return input.autocomplete.toLowerCase().split(/\s+/);
}

function focusedElement(document: Document): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement)
    active = active.shadowRoot.activeElement;
  return active;
}

function fieldHint(input: HTMLInputElement): string {
  const root = input.getRootNode() as Document | ShadowRoot;
  const labelled = (input.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => root.getElementById(id)?.textContent ?? "");
  return [
    input.name,
    input.id,
    input.placeholder,
    input.getAttribute("aria-label"),
    ...Array.from(input.labels ?? [], (label) => label.textContent),
    ...labelled,
  ]
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .toLowerCase();
}

function excluded(input: HTMLInputElement): boolean {
  return (
    autocomplete(input).includes("one-time-code") ||
    /\b(otp|one time|verification|security code|search|captcha)\b/i.test(
      fieldHint(input),
    )
  );
}

function loginScore(input: HTMLInputElement): number {
  if (!["text", "email", "tel"].includes(input.type) || excluded(input))
    return 0;
  if (autocomplete(input).includes("username")) return 4;
  if (input.type === "email" || autocomplete(input).includes("email")) return 3;
  if (
    /\b(e ?mail|user ?name|login|user id|account id)\b/.test(fieldHint(input))
  )
    return 2;
  return 0;
}

function safeForm(form: HTMLFormElement | null, document: Document): boolean {
  const safe = (url: string) =>
    isAllowedLoginUrl(url) && new URL(url).origin === document.location.origin;
  if (!form) return true;
  return (
    safe(form.action) &&
    Array.from(form.elements).every(
      (control) =>
        !(
          (control instanceof HTMLButtonElement ||
            control instanceof HTMLInputElement) &&
          control.hasAttribute("formaction")
        ) || safe(control.formAction),
    )
  );
}

/** Inspect field metadata only. Values are read exclusively on submit or explicit fill. */
export function findLoginFields(
  document: Document,
  mode: "fill" | "capture" | "inspect",
  target?: Element,
): LoginFields | undefined {
  if (!isAllowedLoginUrl(document.location.href)) return undefined;
  const inputs = inputsWithin(document).filter(usable);
  const groups = new Map<
    HTMLFormElement | Document | ShadowRoot,
    HTMLInputElement[]
  >();
  for (const input of inputs) {
    if (excluded(input)) continue;
    const root = input.form ?? (input.getRootNode() as Document | ShadowRoot);
    groups.set(root, [...(groups.get(root) ?? []), input]);
  }
  const results: LoginFields[] = [];
  const focus = target ?? focusedElement(document);
  for (const [root, related] of groups) {
    const form = root instanceof HTMLFormElement ? root : null;
    if (!safeForm(form, document)) continue;
    if (
      target &&
      (form
        ? target !== form &&
          !form.contains(target) &&
          !(target instanceof HTMLInputElement && target.form === form) &&
          !(target instanceof HTMLButtonElement && target.form === form)
        : target.getRootNode() !== root)
    )
      continue;
    const passwords = related.filter(
      (input) =>
        input.type === "password" ||
        ["current-password", "new-password"].some((value) =>
          autocomplete(input).includes(value),
        ) ||
        (input.type === "text" &&
          /\b(password|pass word)\b/.test(fieldHint(input))),
    );
    const current = passwords.filter(
      (input) =>
        autocomplete(input).includes("current-password") ||
        /\b(current|old|existing)\b/.test(fieldHint(input)),
    );
    const fresh = passwords.filter(
      (input) =>
        autocomplete(input).includes("new-password") ||
        /\b(new|create|choose|set|confirm|repeat|retype)\b/.test(
          fieldHint(input),
        ),
    );
    const controls = form
      ? [
          ...Array.from(form.elements),
          ...Array.from(form.querySelectorAll("[role=button]")),
        ]
      : Array.from(
          root.querySelectorAll("button, input[type=submit], [role=button]"),
        );
    const actions = controls
      .filter(
        (control) =>
          control instanceof HTMLButtonElement ||
          (control instanceof HTMLInputElement && control.type === "submit") ||
          control.getAttribute("role") === "button",
      )
      .map((control) =>
        control instanceof HTMLInputElement
          ? control.value
          : control.textContent,
      )
      .join(" ");
    const headings = Array.from(
      root.querySelectorAll("h1,h2,h3,legend"),
      (element) => element.textContent,
    ).join(" ");
    const context = [
      actions,
      headings,
      form?.getAttribute("aria-label"),
      form?.id,
      form?.name,
    ].join(" ");
    const registration =
      /\b(sign[ -]?up|register|create (?:an? )?account|join now)\b/i.test(
        context,
      );
    const change =
      /\b(change|reset|update) (?:your )?password\b/i.test(context) ||
      /\bset (?:a |your )?new password\b/i.test(context);
    const auth =
      isEmailLinkAction(actions) ||
      /\b(sign[ -]?in|log[ -]?in|sign[ -]?up|register|account|continue|next|password)\b/i.test(
        context,
      );
    const ranked = related
      .filter((input) => !passwords.includes(input))
      .map((input) => ({ input, score: loginScore(input) }));
    const top = Math.max(0, ...ranked.map(({ score }) => score));
    const choices = ranked.filter(({ score }) => score > 0 && score === top);
    let login = choices.length === 1 ? choices[0].input : undefined;
    if (!login && top === 0 && passwords.length) {
      const preceding = related.filter(
        (input) =>
          input.type === "text" &&
          !passwords.includes(input) &&
          Boolean(
            input.compareDocumentPosition(passwords[0]) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          ),
      );
      if (preceding.length === 1) login = preceding[0];
    }
    if (
      !passwords.length &&
      (!login || !(auth || autocomplete(login).includes("username")))
    )
      continue;
    // A hidden/disabled password form is not an identifier-only step.
    if (
      !passwords.length &&
      form &&
      Array.from(form.elements).some(
        (el) =>
          el instanceof HTMLInputElement &&
          (el.type === "password" || autocomplete(el).includes("new-password")),
      )
    )
      continue;
    const kind: BrowserLoginForm["kind"] =
      change || (current.length > 0 && fresh.length > 0)
        ? "password-change"
        : registration ||
            fresh.length > 0 ||
            freshPasswordContext.test(context) ||
            passwords.length > 1
          ? "registration"
          : passwords.length
            ? "sign-in"
            : "identifier";
    const newPasswords =
      kind === "registration"
        ? passwords
        : kind === "password-change"
          ? passwords.filter((input) => !current.includes(input))
          : [];
    if (
      mode === "capture" &&
      kind === "password-change" &&
      !newPasswords.length
    )
      continue;
    const selected =
      mode === "capture"
        ? newPasswords.length
          ? newPasswords
          : passwords
        : current.length
          ? current
          : passwords;
    if (
      (mode === "fill" &&
        ((kind !== "identifier" && kind !== "sign-in") ||
          (kind === "sign-in" && selected.length !== 1) ||
          (kind === "identifier" && !login))) ||
      ((mode === "fill" || mode === "capture") &&
        kind === "sign-in" &&
        !login &&
        current.length === 0 &&
        !signInContext.test(context))
    )
      continue;
    const fields: BrowserLoginForm["fields"][number][] = [];
    if (login)
      fields.push(
        login.type === "email" || /e ?mail/.test(fieldHint(login))
          ? "email"
          : "username",
      );
    if (passwords.some((input) => !newPasswords.includes(input)))
      fields.push("current-password");
    if (newPasswords.length) fields.push("new-password");
    if (newPasswords.length > 1) fields.push("confirm-password");
    results.push({
      login,
      password: selected[0],
      passwords: mode === "inspect" ? passwords : selected,
      form,
      description: { kind, fields },
    });
  }
  if (results.length === 1) return results[0];
  const focused = focus
    ? results.filter((result) =>
        result.form
          ? result.form.contains(focus) ||
            ((focus instanceof HTMLInputElement ||
              focus instanceof HTMLButtonElement) &&
              focus.form === result.form)
          : result.login === focus ||
            result.passwords.includes(focus as HTMLInputElement),
      )
    : [];
  return focused.length === 1 ? focused[0] : undefined;
}

export function readSubmittedLogin(
  document: Document,
  target?: Element,
): { login: string; password: string } | undefined {
  const fields = findLoginFields(document, "capture", target);
  if (!fields) return undefined;
  const clicked = target?.closest("button, input[type=submit], [role=button]");
  const controls = clicked
    ? [clicked]
    : !fields.password && fields.form
      ? Array.from(fields.form.querySelectorAll("button, input[type=submit]"))
      : [];
  const requestsEmailLink = controls.some((control) =>
    isEmailLinkAction(
      control instanceof HTMLInputElement
        ? control.value
        : (control.textContent ?? ""),
    ),
  );
  if (requestsEmailLink && fields.login?.checkValidity()) {
    const login = fields.login.value.trim();
    if (login.length <= 128 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login))
      return { login, password: "" };
  }
  if (!fields.password || (fields.form && !fields.form.checkValidity()))
    return undefined;
  const password = fields.password.value;
  const login = fields.login?.value.trim() ?? "";
  if (
    !password ||
    password.length > 4096 ||
    login.length > 1024 ||
    !fields.passwords.every((input) => input.value === password)
  )
    return undefined;
  return { login, password };
}

export function fillLogin(
  document: Document,
  login: string,
  password: string,
  deadlineEpochMs = Number.POSITIVE_INFINITY,
): boolean {
  if (Date.now() >= deadlineEpochMs) return false;
  const initialUrl = document.location.href;
  const fields = findLoginFields(document, "fill");
  if (
    !fields ||
    (!password && (!login || !fields.login)) ||
    password.length > 4096 ||
    login.length > 1024
  )
    return false;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setValue) return false;
  if (fields.login && login) {
    setValue.call(fields.login, login);
    fields.login.dispatchEvent(
      new Event("input", { bubbles: true, composed: true }),
    );
    fields.login.dispatchEvent(
      new Event("change", { bubbles: true, composed: true }),
    );
  }
  if (fields.password && password) {
    // Page handlers may replace the form or navigate during username input.
    const refreshed = findLoginFields(document, "fill");
    if (
      Date.now() >= deadlineEpochMs ||
      document.location.href !== initialUrl ||
      !refreshed ||
      refreshed.password !== fields.password
    )
      return false;
    setValue.call(fields.password, password);
    fields.password.dispatchEvent(
      new Event("input", { bubbles: true, composed: true }),
    );
    fields.password.dispatchEvent(
      new Event("change", { bubbles: true, composed: true }),
    );
  }
  const current = findLoginFields(document, "fill");
  return Boolean(
    current &&
    document.location.href === initialUrl &&
    (!fields.login || !login || current.login?.value === login) &&
    (!fields.password || !password || current.password?.value === password),
  );
}
