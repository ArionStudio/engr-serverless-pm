import designStyles from "../../ui/styles/index.css?raw";

export interface LoginCapturePromptOptions {
  onReview: () => Promise<boolean>;
  onDismiss?: () => void;
}

/** The exact content-script prompt is also mounted by the component gallery. */
export function mountLoginCapturePrompt(
  container: HTMLElement,
  options: LoginCapturePromptOptions,
): () => void {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  const tokens = designStyles.match(/:root\s*\{([^}]+)\}/)?.[1] ?? "";
  const darkTokens = designStyles.match(/\.dark\s*\{([^}]+)\}/)?.[1] ?? "";
  style.textContent = `:host { all: initial; ${tokens} display: block; font: 16px/1.5 system-ui, sans-serif; color: var(--foreground); }
    @media (prefers-color-scheme: dark) { :host { ${darkTokens} } }
    * { box-sizing: border-box; }
    section { padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); box-shadow: 0 4px 24px #0003; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    strong { font-size: 16px; } p { margin: 8px 0 16px; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: var(--radius); padding: 8px 12px; background: var(--primary); color: var(--primary-foreground); }
    button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    .dismiss { background: transparent; color: var(--muted-foreground); font-size: 20px; padding: 0 8px; }
    button:disabled { opacity: .6; cursor: wait; }`;
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "LFSPM login capture");
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "LFSPM";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "dismiss";
  dismiss.setAttribute("aria-label", "Dismiss login prompt");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => {
    host.remove();
    options.onDismiss?.();
  });
  header.append(title, dismiss);
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  message.textContent = "Save or update this login in LFSPM.";
  const review = document.createElement("button");
  review.type = "button";
  review.textContent = "Review login";
  review.addEventListener("click", async () => {
    review.disabled = true;
    let opened = false;
    try {
      opened = await options.onReview();
    } catch {
      /* Toolbar remains available. */
    }
    if (opened) host.remove();
    else {
      message.textContent =
        "Open LFSPM from your browser toolbar to review this login.";
      review.remove();
    }
  });
  panel.append(header, message, review);
  shadow.append(style, panel);
  container.append(host);
  return () => host.remove();
}
