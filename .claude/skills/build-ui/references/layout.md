# layout.md

The page layout is each example's own decision. What is fixed is the directory, the
stylesheet order, and three mechanisms that apply whenever a layout uses what they cover:
a scrolling region gets the scroll fade, a footer collapses by its children, and every
width reflows without a sideways scroll.

## The directory the check suite hardcodes

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

`assets/checks.js` fetches `./styles/base.css`,
`./styles/components.css` and `./styles/layout.css` and imports `./src/icons.js`. It does
not tolerate a different shape.

`index.html`'s head links the three stylesheets in this order, `base.css` first:

```html
<link rel="stylesheet" href="./styles/base.css" />
<link rel="stylesheet" href="./styles/components.css" />
<link rel="stylesheet" href="./styles/layout.css" />
```

`base.css` first is load-bearing, not stylistic: one `assets/checks.js` check finds the
first `prefers-reduced-motion` media block across every linked stylesheet and assumes it
is `base.css`'s own.

## Choosing a layout

Start from what the model gives the reader, not from a previous screen. A single result
to read, a before-and-after comparison, a canvas with a properties panel, a form that
returns one file, a list of items to edit one at a time — each wants its own arrangement,
and any of them is in the house style as long as it keeps the tokens, the patterns in
`css-patterns.md`, and the mechanisms in this file.

```
✗ Opening every screen as a settings header, a list column beside a workspace, and a log
  footer, because that is the pattern written down below.
→ Decide what the reader does first and what the screen must show at once, then pick the
  regions that serves. Use the list-and-workspace pattern only when the example really is
  a set of items edited one at a time.
Why: the pattern fits one kind of task. Laid over a model that returns a single output,
it leaves an empty list column and a workspace with one thing in it, and every release
starts to look like the same app with a different label.
```

## A worked pattern: list and workspace

For an example that is a set of items edited one at a time, this arrangement is already
solved:

```
header   settings row, scrolls horizontally, primary action at the right
main     list column beside a workspace
footer   log and narrow-width actions, collapses when none of its children shows
```

- `header` is a flex row. The settings controls (`.dropdown`, `.setting` labels) sit in
  a horizontally scrolling `#settings` region so the row never wraps; the primary action
  (`.action-primary`) is pinned to the far right with `margin-left: auto`.
- `main` is a two-column grid: the list column beside the workspace.
- `footer` carries the running log, and below the narrow breakpoint the primary action.

```css
grid-template-columns: clamp(13rem, 22vw, 20rem) minmax(16rem, 1fr);
```

| Bound | Value | Reason |
|---|---|---|
| Minimum | `13rem` | fits a list item's thumbnail plus a readable label |
| Fluid | `22vw` | scales with the viewport instead of jumping between two fixed widths |
| Maximum | `20rem` | past this it steals space from the workspace for no benefit |

The workspace takes the rest with a `16rem` floor of its own. Below `900px` the list lies
down as a horizontal rail above the workspace; below `600px` list and workspace become
alternating views, the primary action moves to the footer, and a `.action-back` button
returns from the workspace to the list.

## The footer's self-hiding

A layout does not need a footer. When it has one, the footer is present in the DOM at all
times and is never hidden itself. It has no
vertical padding; its children carry the vertical space, so when no child renders the
footer is zero pixels tall, whatever the reason each child is not rendering:

```css
footer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-inline: var(--space-3);
  background: var(--background-panel);
}

footer > * {
  margin-block: var(--space-2);
  transition: opacity var(--duration-base) ease;
}

footer > :is([hidden], :empty, .scroll-fade:has(> :is([hidden], :empty))) {
  display: none !important;
}

@starting-style {
  footer > * {
    opacity: 0;
  }
}
```

A child can stop rendering three ways — its `hidden` attribute, having no content, or a
`@media` rule such as one that shows the primary action only on narrow screens — and the
footer reads none of them. It collapses because nothing inside it takes up height, which
covers every child a future screen adds without a new selector. `#log` scrolls, so it sits
inside a `.scroll-fade` wrapper and the wrapper is the footer's actual child; the third
branch of the selector collapses a wrapper whose region is hidden or empty, since the
wrapper itself is never either. Measured in Chrome at
976px and 518px: an empty or hidden log collapses the footer to 0px at the wide width, and
at the narrow width the primary action alone keeps it 45px tall.

The `!important` is load-bearing. A child's own layout rule is usually an ID selector —
`#log { display: flex; }` — which outranks `footer > :is([hidden], :empty)` and would put
an empty log back on screen. A child fades in through `@starting-style` when it starts
rendering, and leaves without a transition, since an important `display: none` is not
transitioned.

```
✗ Hiding the footer through a selector that names one child, such as
  footer:not(:has(#log:not([hidden]):not(:empty))) { display: none; }.
→ Put the footer's vertical space on its children and collapse each child that is hidden
  or empty, so the footer is as tall as whatever inside it renders.
Why: a selector cannot see a child a @media rule has set to display: none, so a rule
keyed to the log hides the footer whenever the log is empty — including below 600px,
where the primary action lives in the footer and disappears with it.
```

```
✗ log.classList.add("has-content") / element.style.display = "flex" from JavaScript.
→ Let the log's own [hidden] attribute and :empty state collapse it.
Why: the footer's height is a pure function of what is already in the DOM. A second,
JS-owned source of truth for the same fact is one more place for the two to disagree.
```

## The scroll-fade mechanism

Every scrolling region, whatever the layout, sits inside its own `.scroll-fade` wrapper,
which masks the
region's edges so content fades out before the frame cuts it off, and the fade tracks
scroll position with no JavaScript scroll listener:

```html
<div class="scroll-fade"><div id="region">…</div></div>
```

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

@keyframes scroll-fade-start {
  from { --scroll-fade-start: 0px; }
  to { --scroll-fade-start: var(--space-5); }
}

@keyframes scroll-fade-end {
  from { --scroll-fade-end: var(--space-5); }
  to { --scroll-fade-end: 0px; }
}

.scroll-fade {
  timeline-scope: --scroll-fade;
  padding: 2px;
  mask-image: linear-gradient(
    var(--scroll-fade-direction),
    transparent 0,
    #000 var(--scroll-fade-start),
    #000 calc(100% - var(--scroll-fade-end)),
    transparent 100%
  );
  animation-name: scroll-fade-start, scroll-fade-end;
  animation-timing-function: linear;
  animation-fill-mode: both;
  animation-timeline: --scroll-fade;
  animation-range: 0px var(--space-5), calc(100% - var(--space-5)) 100%;
}

#region {
  scrollbar-width: none;
  scroll-timeline: --scroll-fade block;
}
```

`@property` makes `--scroll-fade-start` and `--scroll-fade-end` animatable custom
properties (a plain custom property cannot be interpolated). The region names its own
scroll position with `scroll-timeline: --scroll-fade block|inline` — `block` for a
vertical scroller, `inline` for a horizontal one — and the wrapper's `timeline-scope` lifts
that name up to where the mask's animation can read it. A region attaches its timeline to
the nearest wrapper above it, so wrappers nest freely: `main`'s wrapper reads `main` and
the `#workspace` wrapper inside `main` reads `#workspace`, both measured in Chrome. What
breaks is two scrolling regions under one wrapper with no wrapper of their own between —
that scope sees two timelines of one name and attaches neither, so both fades stop.
Per region, only two things change: `--scroll-fade-direction` on the wrapper and the axis
of `scroll-timeline` on the region, and a breakpoint that turns a vertical list horizontal
flips both. Whatever places the region in its parent — `flex`, `min-height: 0`, grid
placement — moves to the wrapper, because the wrapper now occupies that slot; the region
keeps its `overflow` and its `scroll-timeline`.

The mask is fully open until the scroller nears an edge, then closes over the last
`--space-5` of scroll distance. This is why the mechanism does not count as motion under
`prefers-reduced-motion`: progress is the scroll fraction, not a clock, so it has no
autoplay and moves only as fast as the reader scrolls. The wrapper's `2px` padding is a
component-intrinsic literal in the sense `tokens.md` uses the term — the gap that keeps
the mask's edge off the scroller's clip, insetting the region 2px inside its slot — not a
step on the spacing scale. It is padding alone. A matching negative margin would push the
wrapper 2px past its slot, and inside a scrolling parent such as `main` those 2px become a
sideways scroll.

```
✗ A scroll event listener that measures scrollTop/scrollLeft and sets an inline mask.
→ @property plus a named scroll-timeline read through timeline-scope, on every scrolling
  region.
Why: a scroll listener runs on the main thread on every frame of scrolling; the
timeline-driven mask is composited and costs nothing per frame.
```

```
✗ The animation shorthand in the shared scroll-fade rule, with the timeline declared in a
  separate rule.
→ animation-name, animation-timing-function, animation-fill-mode, and animation-range as
  longhands, beside animation-timeline in the same rule.
Why: the animation shorthand resets animation-timeline to auto. A timeline rule that
loads earlier than the shorthand, such as a scroller styled in components.css, falls back
to the document timeline, finishes instantly, and keeps its start edge faded at every
scroll position.
```

```
✗ mask-image on the scrolling element itself.
→ The mask on a .scroll-fade wrapper with padding: 2px around the scroller, driven through
  timeline-scope and a named scroll-timeline.
Why: at a fractional device pixel ratio such as Windows' 125% scaling, a mask whose edge
coincides with a scroll container's clip leaves the outermost device pixel 25–50%
transparent even with the fade fully closed, so a region scrolled all the way to its end
still reads as not quite there.
```

## Breakpoints

Each layout picks the widths where it reflows. Two things hold for all of them:

- No width scrolls sideways. `main` never grows wider than the viewport.
- Below `@media (width < 600px)` the page reads as one column. Side-by-side regions stack
  or become alternating views; nothing sits beside anything else at phone width.

The page layout adapts with `@media`, because the viewport itself is the condition being
tested. Components (fields, dropdowns, list items) instead adapt with `@container`,
because the same component must work in whatever slot it lands in regardless of the
viewport — `.field-body:has(.thumbnail)` switching to a stacked layout under
`@container (width < 20rem)` is the existing example of this.

```
✗ @media (width < var(--breakpoint-main));
→ @media (width < 900px); with the literal number, kept the same everywhere layout.css
  uses it.
Why: custom properties cannot be used inside an @media condition — the CSS Custom
Properties specification resolves var() at computed-value time, which is after media
queries have already been evaluated. There is no token to invent here.
```
