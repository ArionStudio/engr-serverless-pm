import type { BrowserLoginForm } from "@lfspm/core";
import designStyles from "../../ui/styles/index.css?raw";

const labels: Record<BrowserLoginForm["kind"], string> = {
  identifier: "Fill email or username",
  "sign-in": "Fill login",
  registration: "Registration detected",
  "password-change": "Password change detected",
};

/** No account names or credentials are rendered into website DOM. */
export function mountLoginFieldAction(
  container: HTMLElement,
  kind: BrowserLoginForm["kind"],
  onOpen: () => Promise<boolean>,
): () => void {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  const tokens = designStyles.match(/:root\s*\{([^}]+)\}/)?.[1] ?? "";
  const darkTokens = designStyles.match(/\.dark\s*\{([^}]+)\}/)?.[1] ?? "";
  style.textContent = `:host { all: initial; ${tokens} display: block; font: 14px/1.4 system-ui, sans-serif; }
    @media (prefers-color-scheme: dark) { :host { ${darkTokens} } }
    button { box-sizing: border-box; display: flex; gap: 10px; align-items: center; font: inherit; padding: 9px 12px; max-width: 100%;
      color: var(--foreground); background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 3px 12px #0002; cursor: pointer; }
    strong { color: var(--primary); } button:hover { border-color: var(--primary); }
    button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    button:disabled { opacity: .7; cursor: default; }`;
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", `LFSPM: ${labels[kind]}`);
  const brand = document.createElement("strong");
  brand.textContent = "LFSPM";
  const label = document.createElement("span");
  label.textContent = labels[kind];
  button.append(brand, label);
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", async (event) => {
    if (!event.isTrusted) return;
    button.disabled = true;
    try {
      if (await onOpen()) {
        host.remove();
        return;
      }
    } catch {
      /* The browser toolbar is the fallback when opening is unavailable. */
    }
    label.textContent = "Open LFSPM in your browser toolbar";
    button.setAttribute(
      "aria-label",
      "LFSPM: Open in browser toolbar or retry",
    );
    button.disabled = false;
  });
  shadow.append(style, button);
  container.append(host);
  return () => host.remove();
}
