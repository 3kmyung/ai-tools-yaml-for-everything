# layout.md

The page skeleton is fixed across every generated example. Only the inside of `main`
changes per example — what the list is, what the workspace shows.

## The directory both check suites hardcode

```
ui/
  index.html
  styles/
    base.css
    components.css
    layout.css
  src/
    icons.js
    ... (per-example modules)
```

`build-model-release`'s `assets/checks.js` fetches `./styles/components.css` and
`./styles/layout.css` and imports `./src/icons.js`; `style-web-interface`'s own
`check-rules.mjs` reads `styles/base.css`, `styles/layout.css`, and `styles/components.css`
from the reference UI it is pointed at. Neither tolerates a different shape.

`index.html`'s head links the three stylesheets in this order, `base.css` first:

```html
<link rel="stylesheet" href="./styles/base.css" />
<link rel="stylesheet" href="./styles/components.css" />
<link rel="stylesheet" href="./styles/layout.css" />
```

`base.css` first is load-bearing, not stylistic: one `assets/checks.js` check finds the
first `prefers-reduced-motion` media block across every linked stylesheet and assumes it
is `base.css`'s own.

## The three-region skeleton

```
header   settings row, scrolls horizontally, primary action at the right
main     list column beside a workspace
footer   log, hides itself when there is nothing to show
```

- `header` is a flex row. The settings controls (`.dropdown`, `.setting` labels) sit in
  a horizontally scrolling `#settings` region so the row never wraps; the primary action
  (`.action-primary`) is pinned to the far right with `margin-left: auto`.
- `main` is a two-column grid: the list column beside the workspace. Deciding which of
  the example's two moving parts is "the list" and which is "the workspace" is the
  layout decision every generated UI has to make; the grid itself does not change.
- `footer` carries the running log and is the one region allowed to disappear entirely.

## The list column

```css
grid-template-columns: clamp(13rem, 22vw, 20rem) minmax(16rem, 1fr);
```

| Bound | Value | Reason |
|---|---|---|
| Minimum | `13rem` | fits a list item's thumbnail plus a readable label |
| Fluid | `22vw` | scales with the viewport instead of jumping between two fixed widths |
| Maximum | `20rem` | past this it steals space from the workspace for no benefit |

The workspace takes the rest with a `16rem` floor of its own.

## The footer's self-hiding

The footer is present in the DOM at all times and hides itself purely through CSS reading
the log's own state — no JavaScript toggles a class:

```css
footer:not(:has(#log:not([hidden]):not(:empty))) {
  display: none;
  opacity: 0;
  translate: 0 100%;
}

@starting-style {
  footer:has(#log:not([hidden]):not(:empty)) {
    opacity: 0;
    translate: 0 100%;
  }
}
```

`:has(#log:not([hidden]):not(:empty))` is true exactly when the log region has content to
show. The default `footer` rule keeps it visible; this rule overrides that back to
`display: none` the moment the log is empty or hidden, and `@starting-style` supplies the
"before" frame so the reappearance transitions in (slides up, fades in) rather than
snapping. `display` can transition here only because `footer`'s own `transition` lists
`display var(--duration-base) allow-discrete`.

```
✗ log.classList.add("has-content") / element.style.display = "flex" from JavaScript.
→ Let :has() read the log's own [hidden] attribute and :empty state.
Why: the footer's visibility is a pure function of what is already in the DOM. A second,
JS-owned source of truth for the same fact is one more place for the two to disagree.
```

## The scroll-fade mechanism

Every scrolling region in the skeleton (`#settings`, `#track-scroller` or its equivalent,
`#log`, `main`, `#workspace`) masks its own edges so content fades out before the frame
cuts it off, and the fade tracks scroll position with no JavaScript scroll listener:

```css
@property --scroll-fade-start {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

@property --scroll-fade-end {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

#region {
  mask-image: linear-gradient(
    var(--scroll-fade-direction),
    transparent 0,
    #000 var(--scroll-fade-start),
    #000 calc(100% - var(--scroll-fade-end)),
    transparent 100%
  );
  animation: scroll-fade-start linear both, scroll-fade-end linear both;
  animation-range: 0px var(--space-5), calc(100% - var(--space-5)) 100%;
  animation-timeline: scroll(self block);
}
```

`@property` makes `--scroll-fade-start` and `--scroll-fade-end` animatable custom
properties (a plain custom property cannot be interpolated). `animation-timeline: scroll(
self block|inline)` drives that animation from the element's own scroll position instead
of wall-clock time — `block` for a vertical scroller, `inline` for a horizontal one, set
per region alongside its `--scroll-fade-direction`. The mask is fully open until the
scroller nears an edge, then closes over the last `--space-5` of scroll distance. This is
why the mechanism does not count as motion under `prefers-reduced-motion`: progress is the
scroll fraction, not a clock, so it has no autoplay and moves only as fast as the reader
scrolls.

```
✗ A scroll event listener that measures scrollTop/scrollLeft and sets an inline mask.
→ @property plus animation-timeline: scroll(self block|inline), as every scrolling
  region in this skeleton already does.
Why: a scroll listener runs on the main thread on every frame of scrolling; the
timeline-driven mask is composited and costs nothing per frame.
```

## Breakpoints

Two fixed breakpoints, both in `layout.css`, both stated here because a future rename of
this document must not lose either number:

```
>= 900px    unchanged. main: [list clamp(13rem, 22vw, 20rem) | workspace]

600–900px   main collapses to one column; the list lies down as a horizontal rail
            above the workspace.
            grid-template-columns: 1fr;
            grid-template-rows: auto minmax(0, 1fr);

< 600px     list and workspace become alternating views; selecting an item switches
            to the workspace. The header settings row already scrolls horizontally
            with a mask fade and stays as is. The primary action moves from header
            to footer for thumb reach, and a `.action-back` button — `.action-cancel`'s
            look, hidden above this width — appears in the header to return from the
            workspace to the list.
```

`@media (width < 900px)` and `@media (width < 600px)` govern the page skeleton, because
the viewport itself is the condition being tested. Components inside the skeleton (fields,
dropdowns, list items) instead adapt with `@container`, because the same component must
work correctly in whatever slot it lands in regardless of the viewport — `.field-body:has(
.thumbnail)` switching to a stacked layout under `@container (width < 20rem)` is the
existing example of this.

## Why breakpoints are not tokenised

`900` and `600` are not custom properties, and they are not going to become any:

```
✗ @media (width < var(--breakpoint-main));
→ @media (width < 900px); with the literal number, written down in this document, the
  one place it lives.
Why: custom properties cannot be used inside an @media condition — the CSS Custom
Properties specification resolves var() at computed-value time, which is after media
queries have already been evaluated. There is no token to invent here; the fix is keeping
the two numbers consistent by writing them down in one place.
```
