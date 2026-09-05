// Run only against the synthetic component gallery, using a serverctl-managed URL.
// Uses an already installed Playwright module; never downloads dependencies.
// Browser sRGB colors are composited through ancestor backgrounds and opacity.
// This is a contrast regression check, not a complete accessibility certification.
function measure(root) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  function rgb(c) {
    if (cache.has(c)) return cache.get(c);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const a = [...ctx.getImageData(0, 0, 1, 1).data];
    a[3] /= 255;
    cache.set(c, a);
    return a;
  }
  function over(f, b) {
    const a = f[3] + b[3] * (1 - f[3]);
    return a
      ? [
          ...f
            .slice(0, 3)
            .map((v, i) => (v * f[3] + b[i] * b[3] * (1 - f[3])) / a),
          a,
        ]
      : [0, 0, 0, 0];
  }
  function pixel(el, ink = [0, 0, 0, 0]) {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      ink = over(ink, rgb(s.backgroundColor));
      ink[3] *= Number(s.opacity);
    }
    return over(ink, [255, 255, 255, 1]);
  }
  function lum(a) {
    return a
      .slice(0, 3)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  function ratio(a, b) {
    const x = lum(a),
      y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const rows = [];
  function add(el, kind, color, min, background) {
    const bg = background || pixel(el),
      fg = pixel(el, rgb(color)),
      s = getComputedStyle(el);
    rows.push({
      id: el.closest(".review-specimen")?.id || "shell/portal",
      kind,
      text: (
        el.innerText ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        ""
      ).slice(0, 70),
      slot: el.getAttribute("data-slot"),
      ratio: ratio(fg, bg),
      min,
      color,
      bg: bg.slice(0, 3),
      cls: el.getAttribute("class"),
    });
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const s = getComputedStyle(el),
      r = el.getBoundingClientRect();
    if (
      !r.width ||
      !r.height ||
      s.visibility !== "visible" ||
      el.closest(
        "[inert],[aria-hidden=true],.sr-only,[disabled],[aria-disabled=true],[data-disabled]",
      ) ||
      s.display === "none"
    )
      continue;
    const text = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    const input = el.matches(
      "input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea",
    );
    if (text || input || el.matches("select")) {
      const placeholder = input && !el.value && el.placeholder;
      const st = placeholder ? getComputedStyle(el, "::placeholder") : s;
      const min =
        parseFloat(st.fontSize) >= 24 ||
        (parseFloat(st.fontSize) >= 18.667 && Number(st.fontWeight) >= 700)
          ? 3
          : 4.5;
      add(el, placeholder ? "placeholder" : "text", st.color, min);
    }
    const slot = el.getAttribute("data-slot");
    if (el.matches(":focus-visible") && parseFloat(s.outlineWidth) > 0)
      add(el, "focus-outline", s.outlineColor, 3, pixel(el.parentElement));
    if (
      s.boxShadow.includes("inset") &&
      el.matches(
        "[aria-pressed=true],[aria-current=page],[data-slot=sidebar-menu-button][data-active],[data-slot=sidebar-menu-sub-button][data-active],[data-slot=tabs-trigger][data-active]",
      )
    )
      add(
        el,
        "selected-marker",
        s.boxShadow.match(/(?:oklch|oklab|rgba?|color)\([^)]*\)/)?.[0] ||
          s.color,
        3,
      );

    if (
      [
        "input",
        "textarea",
        "native-select",
        "checkbox",
        "radio-group-item",
        "input-group",
      ].includes(slot) &&
      parseFloat(s.borderTopWidth) > 0
    )
      add(el, "control-border", s.borderTopColor, 3, pixel(el.parentElement));
    if (["slider-range", "progress-indicator", "switch"].includes(slot))
      add(el, "indicator", s.backgroundColor, 3, pixel(el.parentElement));
    if (slot === "slider-thumb")
      add(el, "thumb-border", s.borderTopColor, 3, pixel(el.parentElement));
    if (slot === "resizable-handle")
      add(el, "handle", s.backgroundColor, 3, pixel(el.parentElement));
  }
  for (const el of root.querySelectorAll("svg")) {
    const r = el.getBoundingClientRect();
    if (
      !r.width ||
      !r.height ||
      el.closest(
        "[disabled],[aria-disabled=true],[data-disabled],[inert],[data-slot=native-select-wrapper]:has(select:disabled)",
      ) ||
      getComputedStyle(el).visibility !== "visible"
    )
      continue;
    add(el, "icon", getComputedStyle(el).color, 3);
  }
  return rows;
}

module.exports = { measure };
