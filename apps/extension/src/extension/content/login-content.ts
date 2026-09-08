import { BROWSER_LOGIN_REQUEST_TIMEOUT_MS } from "../../adapters/browser-login/browser-login-deadline";
import { installLoginFieldMonitor } from "./login-field-monitor";
import {
  fillLogin,
  findLoginFields,
  isAllowedLoginUrl,
  isEmailLinkAction,
  isRegistrationAction,
  loginActionName,
  loginActionSelector,
  readSubmittedLogin,
} from "./login-dom";
import { mountLoginCapturePrompt } from "./login-capture-prompt";

function installLoginContent(): void {
  if (window.top !== window || !isAllowedLoginUrl(location.href)) return;
  const installation = Symbol.for("lfspm.loginContent");
  if (Reflect.get(globalThis, installation)) return;
  Reflect.set(globalThis, installation, true);
  const detectionEnabled = installLoginFieldMonitor();
  const documentToken = crypto.randomUUID();
  let prompt: HTMLElement | undefined;
  let promptGeneration = 0;
  let lastCaptureTime = 0;
  let trustedGestureTime = 0;
  const fieldIds = new WeakMap<HTMLInputElement, string>();
  const inspectForm = () => {
    const fields = findLoginFields(document, "inspect");
    if (!fields) return { form: null, formToken: null, fillable: false };
    const ids = [fields.login, ...fields.passwords]
      .filter((input) => input !== undefined)
      .map((input) => {
        let id = fieldIds.get(input);
        if (!id) {
          id = crypto.randomUUID();
          fieldIds.set(input, id);
        }
        return id;
      });
    return {
      form: fields.description,
      formToken: JSON.stringify([fields.description, ids]),
      fillable: Boolean(findLoginFields(document, "fill")),
    };
  };
  const filledInputs = new WeakSet<HTMLInputElement>();
  let filling = false;

  const invalidatePrompt = () => {
    promptGeneration += 1;
    prompt?.remove();
    prompt = undefined;
  };

  const showPrompt = (generation: number) => {
    if (generation !== promptGeneration) return;
    if (prompt?.isConnected) return;
    prompt = document.createElement("div");
    prompt.style.cssText =
      "all:initial;position:fixed;right:16px;bottom:16px;width:min(360px,calc(100vw - 32px));z-index:2147483647;";
    document.documentElement.append(prompt);
    const container = prompt;
    mountLoginCapturePrompt(container, {
      onReview: async () => {
        const result: unknown = await chrome.runtime.sendMessage({
          channel: "lfspm-login",
          action: "open-popup",
          deadlineEpochMs: Date.now() + BROWSER_LOGIN_REQUEST_TIMEOUT_MS,
        });
        const opened =
          typeof result === "object" &&
          result !== null &&
          "opened" in result &&
          result.opened === true;
        if (opened && prompt === container) invalidatePrompt();
        return opened;
      },
      onDismiss: () => {
        if (prompt === container) invalidatePrompt();
      },
    });
  };

  const capture = (target: Element) => {
    if (filling || !detectionEnabled() || Date.now() - lastCaptureTime < 1000)
      return;
    const generation = promptGeneration;
    const fields = findLoginFields(document, "capture", target);
    if (!fields) return;
    const credential = readSubmittedLogin(document, target);
    if (
      !credential ||
      (credential.password &&
        fields.password &&
        filledInputs.has(fields.password))
    )
      return;
    lastCaptureTime = Date.now();
    void chrome.runtime
      .sendMessage({
        channel: "lfspm-login",
        action: "capture",
        deadlineEpochMs: Date.now() + BROWSER_LOGIN_REQUEST_TIMEOUT_MS,
        url: location.href,
        ...credential,
      })
      .then((result: unknown) => {
        if (
          typeof result === "object" &&
          result !== null &&
          "captured" in result &&
          result.captured === true
        )
          showPrompt(generation);
      })
      .catch(() => {
        /* Extension may be locked or reloaded. */
      });
  };

  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      typeof message !== "object" ||
      message === null ||
      !("channel" in message) ||
      message.channel !== "lfspm-login" ||
      !("action" in message)
    )
      return;
    if (message.action === "inspect") {
      respond({
        documentToken,
        url: location.href,
        ...inspectForm(),
      });
    } else if (message.action === "fill") {
      if (
        !("documentToken" in message) ||
        message.documentToken !== documentToken ||
        !("url" in message) ||
        message.url !== location.href ||
        !("formToken" in message) ||
        message.formToken !== inspectForm().formToken ||
        !("login" in message) ||
        typeof message.login !== "string" ||
        !("password" in message) ||
        typeof message.password !== "string"
      ) {
        respond({
          filled: false,
          error: "The page changed. Open LFSPM again to fill this login.",
        });
        return;
      }
      if (
        !("deadlineEpochMs" in message) ||
        typeof message.deadlineEpochMs !== "number" ||
        !Number.isFinite(message.deadlineEpochMs) ||
        Date.now() >= message.deadlineEpochMs
      ) {
        respond({
          filled: false,
          error: "This fill request expired. Try again.",
        });
        return;
      }
      let filled: boolean;
      filling = true;
      try {
        filled = fillLogin(
          document,
          message.login,
          message.password,
          message.deadlineEpochMs,
        );
      } finally {
        filling = false;
      }
      if (filled && message.password) {
        const current = findLoginFields(document, "fill")?.password;
        if (current) filledInputs.add(current);
      }
      respond({ filled });
    }
  });

  document.addEventListener(
    "input",
    (event) => {
      const target = event.composedPath()[0];
      if (event.isTrusted && target instanceof HTMLInputElement) {
        filledInputs.delete(target);
        const fields = findLoginFields(document, "capture", target);
        if (fields?.login === target && fields.password)
          filledInputs.delete(fields.password);
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      trustedGestureTime = Date.now();
      const button = event
        .composedPath()
        .find(
          (element): element is Element =>
            element instanceof Element && element.matches(loginActionSelector),
        );
      if (!button) return;
      const nativeSubmit =
        (button instanceof HTMLButtonElement ||
          button instanceof HTMLInputElement) &&
        (button.type === "submit" || button.type === "image");
      const label = loginActionName(button);
      const loginButton =
        isEmailLinkAction(label) ||
        isRegistrationAction(label) ||
        /^(sign\s*in|log\s*in|save password|change password|continue)$/i.test(
          label,
        );
      if (nativeSubmit || loginButton) capture(button);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted || event.key !== "Enter") return;
      const target = event.composedPath()[0];
      if (target instanceof HTMLInputElement) {
        trustedGestureTime = Date.now();
        capture(target);
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      if (
        event.isTrusted &&
        Date.now() - trustedGestureTime < 2000 &&
        event.target instanceof Element
      )
        capture(event.submitter ?? event.target);
    },
    true,
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      ((changes.loginDetectionEnabled &&
        changes.loginDetectionEnabled.newValue !== true) ||
        (changes.capturedLoginSessionRetention &&
          changes.capturedLoginSessionRetention.newValue !== true))
    )
      invalidatePrompt();
  });
  const pendingGeneration = promptGeneration;
  void chrome.runtime
    .sendMessage({ channel: "lfspm-login", action: "pending" })
    .then((result: unknown) => {
      if (
        typeof result === "object" &&
        result !== null &&
        "pending" in result &&
        result.pending === true
      )
        showPrompt(pendingGeneration);
    })
    .catch(() => {
      /* No unlocked session or extension was reloaded. */
    });
}

installLoginContent();
