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
example needs two of that component on the same page.
```

```
✗ A class named after this example's domain, such as .track, .track-label, or
  .remove-track.
→ Name the class after the element's role in the layout: .item, .item-label,
  .item-remove.
Why: components.css is shared across every generated example. .track only means
something in a track-based example; the next example's list of speakers or slides has
to either rename every one of these classes or invent its own domain-named duplicates.
.item works for both, unchanged. This is not hypothetical — renaming one example's
tracks to another's cameras required editing the DOM id and the CSS selecting it in the
same commit, and is the single largest source of the divergence between two examples'
otherwise-shared components.css.
```

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
| `.action-add` | `border 1px var(--accent)` | inward ring |
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
in review. `.item` itself carried exactly this mistake: an earlier pass gave the row a
border-recolour focus rule while it was still a plain <li> with a click handler, and no
element inside it could ever trigger `:focus-visible`. The fix was not a CSS change — the
row was restructured into `.item-select` (the clickable, focusable button) and
`.item-remove` (its own button), which is why `.item-select` exists at all. Neither of
the two focus checks in this skill's `check-rules.mjs` catches this: both read
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
