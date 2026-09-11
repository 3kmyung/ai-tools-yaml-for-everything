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
  outline: 2px solid var(--accent);
  outline-offset: -2px;
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

Every dimension a component needs is one of these four scales, even where a step is
currently unused by any component:

- Spacing: `--space-1` through `--space-5`.
- Type size: `--text-sm`, `--text-base`, `--text-lg`.
- Corner radius: `--radius-sm`, `--radius-base`, `--radius-lg`, `--radius-full`.
- Transition duration: `--duration-fast`, `--duration-base`, `--duration-slow`.

```
✗ padding: 10px; or border-radius: 6px;
→ padding: var(--space-2); or border-radius: var(--radius-base);
Why: a value outside the scale cannot be told apart from a typo by the next reader, and
it does not track a future rescale of the whole system.
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
the ten custom properties above.

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
