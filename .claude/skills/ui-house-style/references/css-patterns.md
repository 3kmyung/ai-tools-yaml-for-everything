# css-patterns.md

Read this before writing any CSS rule — elevation, state, focus, motion, or
responsiveness. Every ban below removes a specific default an agent reaches for out of
habit; each carries the pattern this house style uses instead and the reason the default
is wrong here, not just unwanted.

```
✗ box-shadow for elevation
→ Express depth with --background-panel and --radius-lg.
Why: this UI has no light-source metaphor. Layers are surface brightness only.
```

```
✗ A decorative linear-gradient on a surface.
→ Flat colour. The one exception is the scrim on .thumbnail-frame::after, which exists
  to keep a light cover image legible under a dark overlay, not to decorate.
Why: that scrim is the entire gradient budget this house style has. A second decorative
gradient stops the first one from reading as a functional exception and starts it
reading as a style, which invites a third.
```

```
✗ JavaScript toggling a class to express visual state.
→ Read the DOM directly from CSS: body:has(#control[data-value="x"]) ... , the same
  pattern layout.css already uses for aspect ratios.
Why: a class toggled by JS is a second source of truth for a fact the DOM already
states directly (an attribute's value, a popover's open state, an input's checkedness).
Two sources of truth for one fact drift the moment one update path is missed.
```

```
✗ A popover positioning library.
→ The native popover attribute, :popover-open, @starting-style, and
  transition ... allow-discrete.
Why: every popover in this house style — dropdown menu, colour picker — needs open/close
state and an enter/exit transition, both of which the platform now provides natively.
A library is weight spent solving a problem CSS and HTML already solve.
```

```
✗ A scroll event listener that measures scrollTop/scrollLeft to drive a visual effect.
→ @property plus animation-timeline: scroll(self block|inline), as the mask-image
  scroll fade in layout.md already does.
Why: a scroll listener runs on the main thread on every frame of scrolling. A
scroll-driven animation is computed on the compositor and costs nothing per frame.
```

This ban is about painting a visual effect from scroll position, not about reading scroll
position to make a decision. `streaming.md`'s pinned-to-bottom auto-scroll check reads
`scrollTop`/`scrollHeight` to decide whether to scroll at all — control flow evaluated
once per arrival, not a paint evaluated once per scroll frame — and is not the pattern
this rule forbids.

```
✗ A new hover or focus declaration written for one more component.
→ Add the component's selector to the existing :is(...) list that already declares that
  treatment, such as the shared hover-tint rule or the shared disabled-opacity rule.
Why: the same three or four interaction treatments cover every component in this house
style. A new declaration per component is the same rule copied instead of shared, and it
is exactly how one component's hover state quietly stops matching the rest.
```

```
✗ Styling anything in components.css by ID.
→ Style by class.
Why: a component is reusable by definition, and an ID is unique by definition. An ID
selector on a component is a contradiction that resolves itself the first time the
example needs two of that component on the same page. This example's own components.css
once carried that mistake as #render-playlist; commit 6464ebae converted it to
.action-primary, because an ID selector cannot be reused across two instances of the
same component the way a class can.
```

```
✗ A class named after this example's domain, such as .track, .track-label, or
  .remove-track.
→ Name the class after the element's role in the layout: .item, .item-label,
  .item-remove.
Why: components.css is shared across every generated example. .track only means
something in a track-based example; the next example's list of speakers or slides has
to either rename every one of these classes or invent its own domain-named duplicates.
.item works for both, unchanged. Domain-named classes are the single largest source of
divergence between two examples' otherwise-shared components.css.
```

## Categorical colour for a small enumerable set

An interface sometimes has to tell apart a handful of categories at a glance — a
speaker, a track, a label — and one hue is not enough for that.

```
✗ A second accent hue hand-picked to distinguish one category from another, such as a
  fixed hex value for "speaker two" alongside --accent for "speaker one."
→ Derive every category past the first from --accent with filter: hue-rotate(Ndeg), on a
  small, non-text marker element — a dot, a bar segment — never on text, and never as a
  replacement for a text label the row already carries.
Why: tokens.md's ten custom properties hold exactly one accent hue; a hand-picked second
one is a colour invented outside that scale. hue-rotate derives every additional
category from the token that already exists instead of adding new ones, and confining it
to a decorative, non-text marker sidesteps the contrast arithmetic tokens.md works out
for --accent-text, which a rotated hue has not been checked against. Pair the marker with
the row's own text label — a speaker name, a category name — so colour is never the only
channel telling two categories apart.
```

Paint the marker's fill with `--accent` at full strength, not `color-mix`'d down through
`--alpha-1`–`--alpha-3`. Those three steps exist for a tint sitting on top of content
that is already legible without it — a hover wash, a selected-row background — and read
as barely-there pastel once they are the only thing carrying a category's identity, which
defeats the reason the marker exists. Mark a selected or active item some other
scale-compliant way instead — `border-color: var(--text)` on the marker itself, the
`.item.is-selected` border-accent treatment fields and list items already use — rather
than reaching for a fourth, stronger alpha step that does not exist on the scale either.

```
✗ A hue-rotate angle set shipped with no check confirming that every angle it produces
  still clears a usable floor against the surfaces it sits on.
→ Add a check to that interface's own `ui/checks.local.js` asserting every angle the
  interface derives clears 3:1 against both `--background` and `--background-panel`,
  measured by copying the marker's computed `filter` value onto a canvas and reading the
  pixel `getImageData` returns, not by recomputing the hue-rotate matrix by hand —
  `getComputedStyle` on the marker itself returns the pre-filter fill, so it cannot answer
  what the filter actually paints.
Why: rotation angle changes contrast on a non-monotonic curve, not a safe range with soft
edges — a sweep of the accent hue through hue-rotate found some angles under 3:1 against
`--background` and a wider band under 3:1 against the tighter `--background-panel` alone,
so an angle picked on the assumption that "some rotation" is always safe can generate a
marker the same colour as the surface behind it, and nothing in the portable suite reads
a filtered colour to catch that before it ships.
```

```
✗ A hue-rotate angle set whose check only measures each angle's contrast against the
  surfaces it sits on, with nothing checking whether two of those angles paint colours
  close enough to read as the same category.
→ Add a second check to that interface's own `ui/checks.local.js` computing a perceptual
  colour-difference metric — CIEDE2000 between each pair's Lab coordinates, converted
  from the same painted, filter-applied colour the contrast check already reads through
  a canvas `getImageData` — and failing any pair that falls under a floor set for what a
  swatch-sized glance needs, not the angle values themselves.
Why: contrast against the surface and distance between two colours are separate
measurements, and passing one says nothing about the other — this example's own
six-angle set cleared 3:1 against both surfaces at every angle while its `0deg` and
`350deg` markers, only 10 degrees of rotation apart, painted colours a CIEDE2000 of 4.9
apart, indistinguishable at swatch size, so a timeline with those two speakers showed one
colour twice. Angular spacing does not predict this either: the same set's `205deg` and
`249deg` markers, 44 degrees apart, painted colours roughly 30 apart on CIEDE2000, a
wider gap than several pairs spaced further apart in degrees — hue-rotate's matrix bends
perceptual distance the same way it bends contrast, so only measuring what it painted,
never the angle arithmetic, can catch a collision.
```

A colour set is not usable on the strength of the derivation rule alone; it is usable
once its own example's checks have measured both properties a derived set can silently
fail — each colour's contrast against the surfaces it sits on, and every pair's distance
from every other colour in the set — and passed both. Restating the shape these three
rules share on purpose: derive from the one token and never invent a second one, then
verify what that derivation actually painted, on both axes, before trusting it — the same
relationship `tokens.md` already has between defining `--accent`/`--accent-text` and
writing down the exact ratios each one measures at.

```
✗ outline: 0 or outline: none with no replacement indicator in the same declaration
  block.
→ Only pair a removed default outline with a replacement in the same block: a
  border-colour change, an inward ring, or an underline thickness change, as the three
  blocks below do.
Why: removing the default focus ring and stopping there is invisible in a mouse-driven
review and unusable for anyone tabbing through the page. A rule that turns the ring off
without also turning something else on has silently deleted focus indication.
```

`layout.css` keeps its ID selectors on `#settings`, `#workspace`, `#log`, and `#hint`.
Those are singletons in the fixed three-region skeleton, not components, and that
skeleton does not change per example — the ban above is about a reusable component
leaking a per-example identity, not about IDs as a mechanism.

## Focus indication

One rule generates the whole table below: focus recolours the outermost line the element
already has, to `--accent`. An element with no such line, or whose line is already
`--accent`, gets an inward ring instead.

| Element | Existing outer line | Focus treatment |
|---|---|---|
| `.field-line`, `.color-picker-hex` | `border-bottom 1px` | underline → accent |
| `.color-picker-swatch` | `border 1px transparent` | border → accent |
| `.dropdown` | `border 1px var(--border)` | border → accent |
| `.action-add`, `.action-cancel` | `border 1px var(--accent)` | inward ring |
| `.action-primary`, `.action-resume` | none; background is accent | inward ring in `--background` |
| `.item-select`, `.item-remove`, `.revert-field` | none | inward ring |
| `.dropdown-option` | none | inward ring |
| `footer a` | none | `text-decoration-thickness: 2px` |

```css
/* base.css — default. Anything that does not supply its own indicator gets this. */
:is(button, a, input, select):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* components.css — an element with its own indicator turns the default off. */
:is(.dropdown, .color-picker-swatch):focus-visible {
  outline: none;
  border-color: var(--accent);
}

/* Only where the background is already accent does the ring invert. */
:is(.action-primary, .action-resume):focus-visible {
  outline-color: var(--background);
  outline-offset: -3px;
}
```

An element left off both the middle block's selector list and the table above is not
exempt from focus indication — it simply has no line of its own to recolour, so the
`base.css` default inward ring already covers it correctly with no override needed. That
is why `.item-select` needs no entry in the middle block: it has no outer line, so the
default ring is already correct for it.

`.item` itself — the `<li>` — takes no rule here, because it cannot take focus. It is a
plain container; the row's clickable, focusable surface is the `<button class=
"item-select">` inside it. Confirm this before writing any focus rule:

```
✗ A focus-visible rule for an element that cannot receive focus — a bare <li>, a <div>
  with a click listener, or any container this house style has not made into a real
  button, link, or input.
→ Restructure the element into an actual focusable one first — a <button>, not a <div>
  with role="button" and a tabindex — then write the focus rule against that.
Why: a rule targeting an element nothing can focus is dead CSS that reads as coverage
in review. `.item` itself carried exactly this mistake as a plain <li> with a click
handler and a border-recolour focus rule that no element inside it could ever trigger.
The fix restructured the row into `.item-select` (the clickable, focusable button) and
`.item-remove` (its own button) — why both classes exist at all. Neither of
`model-showcase`'s `assets/checks.js` focus checks — "base.css declares a default focus
ring" and "no rule removes the outline without a replacement" — catches this: both read
stylesheet rules, not whether any element in the DOM can ever reach them.
```

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

The `!important` is load-bearing, not defensive: `footer` carries its own `transition`
declaration, and a type selector beats the universal `*, *::before, *::after` in the
cascade, so without the flag this override loses to `footer`'s own rule and the footer
keeps sliding under reduced motion.

This block does not reach the scroll-driven fades, and that is correct rather than a
gap. Every element using `animation-timeline: scroll(...)` has its animation progress
driven by scroll position, not by `animation-duration` — collapsing the duration to
`.01ms` is a no-op for a timeline that was never reading duration in the first place. A
mask that tracks scroll position has no autoplay and moves only as fast as the reader
scrolls; that is not the kind of motion `prefers-reduced-motion` is about. Anything on
this page that is actually clock-driven is caught by the block above.

## Responsive

The page skeleton (`header` / `main` / `footer`) adapts with `@media`, because the
viewport itself is the condition being tested. Components inside the skeleton (fields,
dropdowns, list items) instead adapt with `@container`, because the same component has
to work correctly in whatever slot it lands in, regardless of the viewport. `layout.md`
carries the breakpoint numbers, the collapse diagram, and the `.field-body` container
example — read it there; this file does not repeat it.
