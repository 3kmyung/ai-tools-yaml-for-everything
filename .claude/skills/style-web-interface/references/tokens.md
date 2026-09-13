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

  --category-1: #0072b2;
  --category-2: #e69f00;
  --category-3: #009e73;
  --category-4: #d55e00;
  --category-5: #cc79a7;
  --category-6: #56b4e9;
  --category-7: #f0e442;

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
the seventeen colour custom properties above — the ten base colours and the seven
`--category-*` markers.

## The accent split

`--accent` (`#007ffb`) and `--accent-text` (`#0a6bd4`) are not interchangeable, and
`--link` is not a third colour — it aliases `--accent-text`.

The skeleton's `header`, list column, and `footer` paint `--background-panel`, not
`--background` — a text token has to clear 4.5:1 on both surfaces, and
`--background-panel` is the tighter of the two.

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

`--category-1` through `--category-7` tell apart a small enumerable set — speakers,
labels — on a marker: a dot, a timeline bar. They are the Okabe–Ito palette, chosen
because its seven colours stay distinguishable under the common colour-vision
deficiencies. The order is reshuffled so yellow, the one that nearly disappears on a
light surface, comes last and is reached only by a seventh category. Past seven
categories, cycle.

| Token | Value | Okabe–Ito name | On `--background` | On `--background-panel` |
|---|---|---|---|---|
| `--category-1` | `#0072b2` | blue | 4.84:1 | 4.54:1 |
| `--category-2` | `#e69f00` | orange | 2.10:1 | 1.97:1 |
| `--category-3` | `#009e73` | bluish green | 3.20:1 | 2.99:1 |
| `--category-4` | `#d55e00` | vermillion | 3.61:1 | 3.39:1 |
| `--category-5` | `#cc79a7` | reddish purple | 2.86:1 | 2.68:1 |
| `--category-6` | `#56b4e9` | sky blue | 2.16:1 | 2.02:1 |
| `--category-7` | `#f0e442` | yellow | 1.24:1 | 1.16:1 |

These are not held to a contrast floor, and most of them miss 3:1 on the panel. What
keeps them usable is their distance from each other — the closest pair, orange and
yellow, sits a CIEDE2000 of 21.7 apart, and `build-model-release`'s `assets/checks.js`
holds every pair to 20 — and the text label every marker sits beside.

```
✗ A category colour on text, or a category colour as the only thing telling two rows
  apart.
→ Paint a marker with it beside the row's own text label — a speaker name, a category
  name.
Why: yellow measures 1.16:1 on the panel, so for that category the label is the only
part a reader can reliably see, and any of the seven on text would fail 4.5:1 outright.
```
