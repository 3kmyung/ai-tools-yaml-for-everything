# tokens.md

`base.css` below is the house token sheet, embedded verbatim. Lay it down unchanged in
every generated `ui/`; do not re-derive or re-order it.

```css
:root {
  color-scheme: light;

  --background: #f7f7f8;
  --background-panel: #eef0f2;
  --border: #9c9ea4;
  --text: #1c1d1f;
  --text-caption: #6b6d74;
  --disabled: #a9abb0;
  --accent: #007ffb;
  --accent-text: #0a6bd4;
  --icon: var(--text-caption);
  --link: var(--accent-text);

  --category-1: #807eb3;
  --category-2: #885c83;
  --category-3: #b07174;
  --category-4: #8f623b;
  --category-5: #8b884d;
  --category-6: #497a55;
  --category-7: #419494;
  --category-8: #3f7397;

  --alpha-1: 6%;
  --alpha-2: 12%;
  --alpha-3: 18%;

  --space-1: 0.5rem;
  --space-2: 0.75rem;
  --space-3: 1rem;
  --space-4: 1.25rem;
  --space-5: 1.5rem;

  --text-sm: 0.75rem;
  --text-base: 0.875rem;
  --text-lg: 1rem;

  --radius-sm: 0.25rem;
  --radius-base: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-full: 999px;

  --border-width: 1px;

  --duration-fast: .24s;
  --duration-base: .32s;
  --duration-slow: .56s;
}

html, body {
  height: 100%;
  overflow: hidden;
}

body {
  margin: 0;
  display: flex;
  flex-direction: column;
  font: 400 var(--text-base) "Noto Sans", "Noto Sans KR", "Noto Sans SC", "Noto Sans JP";
  background: var(--background);
  color: var(--text);
}

button {
  font: inherit;
}

:is(button, a, input, select):focus-visible {
  outline: var(--border-width) solid var(--accent);
  outline-offset: calc(-1 * var(--border-width));
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

## The scale is the contract

Every dimension a component needs is one of these five scales, even where a step is
currently unused by any component:

- Spacing: `--space-1` through `--space-5`.
- Type size: `--text-sm`, `--text-base`, `--text-lg`.
- Corner radius: `--radius-sm`, `--radius-base`, `--radius-lg`, `--radius-full`.
- Line width: `--border-width`, the only step.
- Transition duration: `--duration-fast`, `--duration-base`, `--duration-slow`.

```
✗ padding: 10px; or border-radius: 6px;
→ padding: var(--space-2); or border-radius: var(--radius-base);
Why: a value outside the scale cannot be told apart from a typo by the next reader, and
it does not track a future rescale of the whole system.
```

## One line width

Every `border`, `outline`, and `outline-offset` draws with `--border-width` — `1px` — or a
`calc()` multiple of it for an offset. Focus rings included: the default ring is `1px`,
thinner than the `2px` WCAG 2.2's AAA focus-appearance criterion asks for, and the house
takes that trade on purpose — focus reads through the ring's `--accent` colour, not its
weight.

```
✗ border: 2px solid var(--text); or outline-offset: -3px; or text-decoration-thickness: 2px;
→ border: var(--border-width) solid var(--text); or
  outline-offset: calc(-2 * var(--border-width));
Why: one weight is the whole line vocabulary. A state that used to thicken a line changes
its colour instead — a selected timeline block recolours its border to --text — or falls
back to the default ring, as a focused footer link does, because a thicker line is a
second weight the scale does not have.
```

## The one exception: component-intrinsic dimensions

A handful of sizes in `components.css` are physical dimensions of one specific widget,
not steps on a reusable scale, and are written as literal `rem` values instead of a
token:

- Thumbnail: `2.5rem` (`.thumbnail`, `.color-picker-swatch`).
- Icon button: `1.75rem` (`.revert-field`, `.item-remove`, and the smaller
  `.color-picker-swatch`).
- Slider thumb: `0.875rem` (`.color-picker-slider` track and thumb).

```
✗ Tokenising a component-intrinsic size, such as --thumbnail-size: 2.5rem.
→ Leave it as a literal rem value on the rule that owns it.
Why: these numbers describe one widget's own geometry, not a step reused across the
system. A token implies "reuse me elsewhere"; nothing else should reuse a thumbnail's
edge length.
```

Do not invent colours outside `:root`. Every colour a component needs is already one of
the eighteen colour custom properties above — the ten base colours and the eight
`--category-*` markers.

## The accent split

`--accent` (`#007ffb`) and `--accent-text` (`#0a6bd4`) are not interchangeable, and
`--link` is not a third colour — it aliases `--accent-text`.

Three of the reference UI's four regions (`header`, `#tracks`, `footer`) paint
`--background-panel`, not `--background` — a text token has to clear 4.5:1 on both
surfaces, and `--background-panel` is the tighter of the two.

| Property | On `--background` | On `--background-panel` | Use for |
|---|---|---|---|
| `--accent` | 3.61:1 | 3.39:1 | fills, borders, focus rings — never text |
| `--accent-text` | 4.82:1 | 4.52:1 | link text, warning text, text sitting on an accent fill |
| `--disabled` | 2.15:1 | 2.02:1 | disabled controls only |
| `--text-caption` | 4.83:1 | 4.52:1 | instructional and secondary text |

`--background-panel` governs: both text tokens are chosen so they clear 4.5:1 there,
which leaves headroom on `--background`. `--accent` fails WCAG AA for normal text (needs
4.5:1) on either surface, at 3.61:1 and 3.39:1; `--accent-text` clears both at 4.82:1 and
4.52:1 and stays in the same blue family, so a component keeping the accent hue as text
reads `--accent-text`, not `--accent`.

```
✗ color: var(--accent); on any text node.
→ color: var(--accent-text); for that same blue used as text.
Why: --accent measures 3.61:1 against --background and 3.39:1 against
--background-panel, below the 4.5:1 AA floor for normal text on either surface. The fill
itself is fine at those ratios; only text use fails.
```

## `--disabled` is not for content

`--disabled` (`#a9abb0`, 2.15:1 on `--background`, 2.02:1 on `--background-panel`) is
exempt from contrast requirements because it marks a control the user cannot currently
activate — the low contrast itself communicates "unavailable." Real instructional text,
such as an empty-state hint, is not exempt just because it is quiet.

```
✗ color: var(--disabled); on a hint, placeholder, or any sentence meant to be read.
→ color: var(--text-caption); (4.83:1 on --background, 4.52:1 on --background-panel).
Why: --disabled signals "cannot activate this control," not "this is minor text." Reusing
it for content that must be read fails contrast for no exemption WCAG actually grants.
```

## Category colours

`--category-1` through `--category-8` tell apart a small enumerable set — speakers,
labels — on a marker: a dot, a timeline bar. They are fixed, not derived: eight hues
evenly spaced at OKLCH chroma 0.08, alternating two lightness steps (0.62 and 0.54) so
neighbouring categories differ in lightness as well as hue. Past eight categories, cycle.

| Token | Value | On `--background` | On `--background-panel` |
|---|---|---|---|
| `--category-1` | `#807eb3` | 3.53:1 | 3.31:1 |
| `--category-2` | `#885c83` | 5.02:1 | 4.71:1 |
| `--category-3` | `#b07174` | 3.59:1 | 3.37:1 |
| `--category-4` | `#8f623b` | 4.93:1 | 4.62:1 |
| `--category-5` | `#8b884d` | 3.43:1 | 3.21:1 |
| `--category-6` | `#497a55` | 4.67:1 | 4.38:1 |
| `--category-7` | `#419494` | 3.33:1 | 3.12:1 |
| `--category-8` | `#3f7397` | 4.77:1 | 4.47:1 |

Every token clears 3:1, the WCAG floor for a graphical object, on both surfaces. The
closest pair, `--category-1` and `--category-2`, sits a CIEDE2000 of 16.6 apart;
`build-model-release`'s `assets/checks.js` holds every pair to 16. Eight muted colours
cannot also reach the 20 a six-colour set can — muting and count trade against distance,
and this set chose count.

```
✗ A category colour on text, or a category colour as the only thing telling two rows
  apart.
→ Paint a marker with it beside the row's own text label — a speaker name, a category
  name.
Why: 3:1 is a marker's floor, not a sentence's 4.5:1, and colour alone fails anyone who
cannot separate two of the eight — the closest pair is only 16.6 apart.
```
