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

These historical measurements guided the token corrections below. The custom
contrast and exhaustive variant audit scripts were removed at the user's request
on 2026-09-06. Visual review belongs in the gallery; automated tests cover product
behavior. Historical measurements do not guarantee future screen accessibility.

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

| Problem measured before the fix                                       | Change                                                                                                                              |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Input boundaries around 1.22:1 in light mode and 1.67:1 in dark mode  | Separate the opaque `input` boundary token from the existing translucent `input-surface` fill                                       |
| Light-mode destructive labels at 3.97:1                               | Darker error color; also adjusted dark-mode error color after its hover state failed                                                |
| Dark-mode links at 2.16:1 and progress/range indicators around 1.69:1 | Lighter violet with a dark primary foreground in dark mode                                                                          |
| Tag-input placeholders inherited a half-opacity foreground            | Use the explicit muted text token                                                                                                   |
| Tag removal faded the entire control, including its focus outline     | Use muted icon color with full element opacity                                                                                      |
| Inactive table sort arrows below 3:1                                  | Use muted foreground instead of reducing opacity                                                                                    |
| Focus depended on translucent halos                                   | A solid keyboard focus color with a system color under forced colors; subsequently reduced to 1px without outlining page containers |
| Selected controls relied on subtle background differences             | Visible inset marks on tabs, toggles, current pagination and selected navigation                                                    |
| Menu readability could depend on the content underneath               | Opaque popover background for dropdown and combobox panels                                                                          |

Resizable handles now use the control-boundary color. Native controls receive the
appropriate `color-scheme`; sidebar primary/focus colors share the checked tokens.

Mira, mauve, violet, Figtree and Hugeicons remain the design basis. These are
intentional accessibility overrides to preset `b2CjQp4R0`, requested after the
initial exact-preset decision. Preserve and recheck them after shadcn CLI updates.
The preset alone is not evidence of contrast compliance.

## Review changes

Use the component gallery to inspect affected controls in both themes and at
relevant widths. Check keyboard access, readable field guidance, visible errors,
and focus. Use browser accessibility tools when a changed color needs checking;
do not maintain bespoke color calculations or pixel assertions as regression tests.

The gallery inventory still checks that actual components and their named
variants are registered. Interaction tests cover behavior such as choosing
variants, accessible labels, secret concealment and safe cancellation.
