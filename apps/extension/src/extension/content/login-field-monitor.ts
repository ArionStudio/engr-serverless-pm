import { BROWSER_LOGIN_REQUEST_TIMEOUT_MS } from "../../adapters/browser-login/browser-login-deadline";
import { elementsWithinOpenRoots, findLoginFields } from "./login-dom";
import { mountLoginFieldAction } from "./login-field-action";

/** Re-evaluate metadata on focus and DOM changes; never read or retain field values. */
export function installLoginFieldMonitor(): () => boolean {
  let enabled = false;
  let anchor: HTMLInputElement | undefined;
  let host: HTMLElement | undefined;
  let kind: string | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const remove = () => {
    host?.remove();
    host = undefined;
    kind = undefined;
  };
  const position = () => {
    if (!host || !anchor) return;
    const bounds = anchor.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) {
      host.style.display = "none";
      return;
    }
    host.style.display = "block";
    const width = host.offsetWidth;
    const height = host.offsetHeight;
    const obstacles = elementsWithinOpenRoots(
      document,
      "input, button, select, textarea, a[href], [role=button], label",
    )
      .filter(
        (element) =>
          element !== anchor &&
          !element.contains(anchor!) &&
          !(
            element instanceof HTMLLabelElement && element.control === anchor
          ) &&
          !host!.contains(element),
      )
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const candidates = [
      { left: bounds.right + 8, top: bounds.top },
      { left: bounds.left - width - 8, top: bounds.top },
      { left: bounds.left, top: bounds.bottom + 4 },
      { left: bounds.left, top: bounds.top - height - 4 },
    ];
    const placement = candidates.find(
      ({ left, top }) =>
        left >= 8 &&
        top >= 8 &&
        left + width <= innerWidth - 8 &&
        top + height <= innerHeight - 8 &&
        obstacles.every(
          (rect) =>
            left + width <= rect.left ||
            left >= rect.right ||
            top + height <= rect.top ||
            top >= rect.bottom,
        ),
    );
    // Never block a website control when its layout leaves no safe adjacent space.
    host.style.display = placement ? "block" : "none";
    if (placement) {
      host.style.left = `${placement.left}px`;
      host.style.top = `${placement.top}px`;
    }
  };
  const refresh = () => {
    observeRoots();
    if (scheduled !== undefined) clearTimeout(scheduled);
    scheduled = undefined;
    if (!enabled || !anchor?.isConnected) {
      remove();
      return;
    }
    const fields = findLoginFields(document, "inspect", anchor);
    if (
      !fields ||
      (fields.login !== anchor && !fields.passwords.includes(anchor))
    ) {
      remove();
      return;
    }
    if (!host || kind !== fields.description.kind) {
      remove();
      kind = fields.description.kind;
      host = document.createElement("div");
      host.setAttribute("data-lfspm-field-action", "");
      host.style.cssText =
        "all:initial;position:fixed;z-index:2147483646;max-width:calc(100vw - 16px)";
      document.documentElement.append(host);
      mountLoginFieldAction(host, fields.description.kind, async () => {
        const result: unknown = await chrome.runtime.sendMessage({
          channel: "lfspm-login",
          action: "open-detected",
          deadlineEpochMs: Date.now() + BROWSER_LOGIN_REQUEST_TIMEOUT_MS,
        });
        const opened =
          typeof result === "object" &&
          result !== null &&
          "opened" in result &&
          result.opened === true;
        if (opened) remove();
        return opened;
      });
    }
    position();
  };
  const schedule = () => {
    if (enabled && scheduled === undefined && anchor)
      scheduled = setTimeout(refresh, 100);
  };
  const selectField = (event: Event) => {
    if (host && event.composedPath().includes(host)) return;
    const target = event.composedPath()[0];
    anchor = target instanceof HTMLInputElement ? target : undefined;
    refresh();
  };
  document.addEventListener("focusin", selectField, true);
  document.addEventListener("pointerdown", selectField, true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        anchor = undefined;
        remove();
      }
    },
    true,
  );
  document.addEventListener("scroll", position, {
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", position, { passive: true });
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.target !== host &&
          !host?.contains(record.target) &&
          !(
            record.type === "childList" &&
            [...record.addedNodes, ...record.removedNodes].every(
              (node) => node === host,
            )
          ),
      )
    )
      schedule();
  });
  const observationOptions: MutationObserverInit = {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "type",
      "autocomplete",
      "name",
      "id",
      "placeholder",
      "aria-label",
      "aria-labelledby",
      "role",
      "form",
      "action",
      "formaction",
      "hidden",
      "disabled",
      "readonly",
      "class",
      "style",
    ],
  };
  function observeRoots() {
    // Reconnect to the current tree so detached component roots are released.
    observer.disconnect();
    observer.observe(document.documentElement, observationOptions);
    if (!enabled || !anchor?.isConnected) return;
    for (const element of elementsWithinOpenRoots(document, "*")) {
      if (element.shadowRoot)
        observer.observe(element.shadowRoot, observationOptions);
    }
  }
  observeRoots();
  const apply = (value: boolean) => {
    enabled = value;
    if (document.activeElement instanceof HTMLInputElement)
      anchor = document.activeElement;
    refresh();
  };
  void chrome.storage.local.get("loginDetectionEnabled").then(
    (value) => apply(value.loginDetectionEnabled === true),
    () => apply(false),
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.loginDetectionEnabled)
      apply(changes.loginDetectionEnabled.newValue === true);
  });
  return () => enabled;
}
