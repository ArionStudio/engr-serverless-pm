# Component contrast review

Reviewed 2026-09-05 against the production-built component gallery in Chrome.
All 75 catalog entries were exercised in light and dark themes, at 1440px and
320px viewport widths. The audit also changes every available scenario selector,
checks distinct enabled control styles in hover and keyboard focus, opens the
menu/dialog/sheet/popover/tooltip/toast examples, and exercises combobox options
and checked/selected controls.

The current behavior/hover/focus run recorded 210 theme/state combinations and
62,462 measurements, with zero below-threshold results and zero browser errors.
The variant follow-up separately selected all 263 supported options in both
themes at both widths, for 1,052 selections and 117,364 measurements. It also
returned zero contrast failures, browser errors or overflowing examples.

The verification scripts record the browser version, measurement count, state
list, per-entry minimum ratios, failures and browser errors in local JSON reports.
These generated reports are not committed; use the commands below to reproduce them.
These are gallery measurements, not a claim that every possible future screen
composition or arbitrary consumer-supplied color is accessible.

## Requirements

- Normal text, including placeholder, help and error text: at least 4.5:1.
- Large text: at least 3:1, using WCAG's size/weight thresholds.
- Necessary control boundaries, state marks, icons and focus outlines: at least
  3:1 against the adjacent background.

Do not round a failing ratio up to a pass. Inactive controls and purely decorative
separators are exempt from these contrast requirements. A low-contrast decorative
card border is different from the boundary needed to locate a text field.
[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Corrections

| Problem measured before the fix | Change |
| --- | --- |
| Input boundaries around 1.22:1 in light mode and 1.67:1 in dark mode | Separate the opaque `input` boundary token from the existing translucent `input-surface` fill |
| Light-mode destructive labels at 3.97:1 | Darker error color; also adjusted dark-mode error color after its hover state failed |
| Dark-mode links at 2.16:1 and progress/range indicators around 1.69:1 | Lighter violet with a dark primary foreground in dark mode |
| Tag-input placeholders inherited a half-opacity foreground | Use the explicit muted text token |
| Tag removal faded the entire control, including its focus outline | Use muted icon color with full element opacity |
| Inactive table sort arrows below 3:1 | Use muted foreground instead of reducing opacity |
| Focus depended on translucent halos | A shared solid 2px keyboard outline, with a system color under forced colors |
| Selected controls relied on subtle background differences | Visible inset marks on tabs, toggles, current pagination and selected navigation |
| Menu readability could depend on the content underneath | Opaque popover background for dropdown and combobox panels |

Resizable handles now use the control-boundary color. Native controls receive the
appropriate `color-scheme`; sidebar primary/focus colors share the checked tokens.

Mira, mauve, violet, Figtree and Hugeicons remain the design basis. These are
intentional accessibility overrides to preset `b2CjQp4R0`, requested after the
initial exact-preset decision. Preserve and recheck them after shadcn CLI updates.
The preset alone is not evidence of contrast compliance.

## Reproduce

Start or restart the production gallery through `serverctl`, then pass the URL
it returns. The script uses an already installed Playwright module; it does not
install a package or start a server. Set `PLAYWRIGHT_MODULE` to an installed module
path when it cannot be resolved normally. `CHROME_BINARY` can select the installed
Chrome executable.

```bash
mkdir -p .local/ui-ux/reports
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CONTRAST_REPORT=.local/ui-ux/reports/gallery-contrast-results.json \
node docs/ui-ux/verification/contrast.verify.cjs "http://HOST:PORT/gallery.html"
```

Run the variant and layout matrix against the same managed URL:

```bash
mkdir -p .local/ui-ux/reports
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
VARIANTS_REPORT=.local/ui-ux/reports/gallery-variants-results.json \
node docs/ui-ux/verification/gallery-variants.verify.cjs "http://HOST:PORT/gallery.html"
```

Both scripts use `contrast-measure.cjs` for the color calculations. Each declared
option is checked independently with the other axes reset between checks; this
is not a Cartesian product of unrelated props. Opening/closing transitions must
settle before measurement.

The behavior runner fails on a below-threshold measurement, browser error or missing
catalog/theme coverage. It measures settled computed colors, converts them to
browser sRGB, and composites backgrounds and opacity before calculating WCAG
relative luminance. It checks the foreground/background colors, not antialiased
text-edge pixels. Browser image conversion has 8-bit precision, so avoid choosing
new colors that sit exactly on a threshold.

The run is scoped to synthetic gallery content. Native OS select popups,
forced-color rendering, arbitrary raster images, gradients, future charts, and
all possible combinations of component props require separate checks. Disabled
controls are excluded; decorative separators, shadows and skeletons are not
required to reach 3:1. Icon checks use the current single-color Hugeicons drawing
style. Focus contrast does not by itself prove that focus is never obscured.

The gallery was also visually inspected in both themes. Production extension
build, gallery build, extension lint and all eleven gallery interaction
tests passed. This is contrast verification, not a full WCAG certification.
