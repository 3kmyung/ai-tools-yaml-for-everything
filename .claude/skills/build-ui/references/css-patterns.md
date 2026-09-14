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
✗ JavaScript toggling a class for a fact the DOM already states — an attribute's value,
  a popover's open state, an input's checkedness.
→ Read the DOM directly from CSS: body:has(#control[data-value="x"]) ... , the same
  pattern layout.css already uses for aspect ratios. A state no attribute or pseudo-class
  carries, such as which list item is selected, keeps its class: .is-selected,
  .is-default.
Why: a class toggled for a fact the DOM already states is a second source of truth, and
two sources of truth for one fact drift the moment one update path is missed. A
selection lives only in the script's state, so its class is the one place the DOM states
it at all.
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
selector on a component is a contradiction that resolves itself the first time a screen
needs two of that component on the same page — a primary action styled as #render
cannot also be the footer's copy of that action, where .action-primary can.
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
speaker, a track, a label — and one hue is not enough for that. `tokens.md` carries
seven `--category-*` tokens for exactly this; its "Category colours" section holds their
values, their measured contrast, and the rule that keeps them off text.

```
✗ A hand-picked hex per category, or a category derived from --accent with
  filter: hue-rotate(Ndeg).
→ Number each category 1 to 7 — its index modulo seven, plus one — into a data-category
  attribute on the marker, and map it with one CSS line per token:
  [data-category="3"] { --category-color: var(--category-3); }. The marker paints
  var(--category-color).
Why: a hand-picked hex is a colour invented outside the scale. hue-rotate on the accent
paints whatever the angle lands on — near-maximum chroma, with contrast and distance that
shift unpredictably from one angle to the next — so every angle set needed its own
canvas-read checks. The seven tokens are a published set built to survive colour-vision
deficiencies, fixed, and measured once in `assets/checks.js`.
```

```
✗ element.style.setProperty("--category-color", "var(--category-3)") from JavaScript.
→ element.dataset.category = "3", read by the [data-category] rules above.
Why: an inline custom property is a second source of truth the stylesheet cannot select
on and a check cannot query; the attribute is the fact itself, the same reason
JavaScript class toggling is banned above.
```

That ban is about category colour, which has seven values an attribute selector can
enumerate. A continuous value no selector can enumerate — a block's start and length on a
timeline, a meter's fill — does go in an inline custom property set from script, such as
`--start`, `--duration`, or `--value`, and the stylesheet does the geometry with `calc()`.

Paint the marker's fill with `--category-color` at full strength, not `color-mix`'d down through
`--alpha-1`–`--alpha-3`. Those three steps exist for a tint sitting on top of content
that is already legible without it — a hover wash, a selected-row background — and read
as barely-there pastel once they are the only thing carrying a category's identity, which
defeats the reason the marker exists. Mark a selected or active item some other
scale-compliant way instead — `border-color: var(--text)` on the marker itself, the
`.item.is-selected` border-accent treatment fields and list items already use — rather
than reaching for a fourth, stronger alpha step that does not exist on the scale either.

```
✗ outline: 0 or outline: none with no replacement indicator in the same declaration
  block.
→ Only pair a removed default outline with a replacement in the same block: a
  border-colour change or an inward ring, as the blocks below do.
Why: removing the default focus ring and stopping there is invisible in a mouse-driven
review and unusable for anyone tabbing through the page. A rule that turns the ring off
without also turning something else on has silently deleted focus indication.
```

`layout.css` keeps its ID selectors on the layout's singleton page regions — whatever the
page has, such as `#settings`, `#workspace`, `#log`, or `#hint`. Those are not components, and
unlike a component's class name they are allowed to be per-example — the ban above is
about a reusable component leaking a per-example identity, not about IDs as a mechanism.

## Focus indication

One rule generates the whole table below: focus recolours the outermost line the element
already has, to `--accent`. An element with no such line, or whose line is already
`--accent`, gets an inward ring instead.

| Element | Existing outer line | Focus treatment |
|---|---|---|
| `.field-line`, `.color-picker-hex` | `border-bottom` at `--border-width` | underline → accent |
| `.color-picker-swatch` | `border` at `--border-width`, transparent | border → accent |
| `.dropdown` | `border` at `--border-width`, `var(--border)` | border → accent |
| `.action-add`, `.action-cancel` | `border` at `--border-width`, `var(--accent)` | inward ring |
| `.action-primary`, `.action-resume` | none; background is accent | inward ring in `--background` |
| `.item-select`, `.item-remove`, `.revert-field` | none | inward ring |
| `.dropdown-option` | none | inward ring |
| `footer a` | an underline already at `--border-width` | inward ring — the underline has no heavier weight to move to |
| a marker filled with a `--category-*` token | none; the fill changes per category | outward ring in `--text` |

`base.css` supplies the default that anything without its own indicator gets:

```css
:is(button, a, input, select):focus-visible {
  outline: var(--border-width) solid var(--accent);
  outline-offset: calc(-1 * var(--border-width));
}
```

`components.css` turns that default off wherever an element carries its own indicator:

```css
:is(.dropdown, .color-picker-swatch):focus-visible {
  outline: none;
  border-color: var(--accent);
}
```

The ring inverts only where the background is already accent:

```css
:is(.action-primary, .action-resume):focus-visible {
  outline-color: var(--background);
  outline-offset: calc(-2 * var(--border-width));
}
```

An element left off both the middle block's selector list and the table above is not
exempt from focus indication — it simply has no line of its own to recolour, so the
`base.css` default inward ring already covers it correctly with no override needed. That
is why `.item-select` needs no entry in the middle block: it has no outer line, so the
default ring is already correct for it.

A focusable marker painted with a category colour — a timeline block — is the one place
the ring moves outside the element and changes colour:

```
✗ An --accent ring or an --accent border as the focus indicator on an element filled with
  a --category-* token.
→ outline: var(--border-width) solid var(--text); outline-offset: var(--border-width);
  so the ring sits outside the fill, against the track behind it.
Why: --category-1 is Okabe–Ito blue, close enough to --accent that an accent ring on or
inside a speech block disappears. A ring outside the fill contrasts with the one surface
behind every block, not with a fill that changes from block to block.
```

A text input inside `.field-line` keeps that default ring too. The parent's underline
turning `--accent` through `:has(:focus-visible)` is added beside the ring, not a
replacement for it, so no rule turns the input's own outline off.

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
`assets/checks.js`'s focus checks — "base.css declares a default focus
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

The `!important` is load-bearing, not defensive: `footer > *` carries its own `transition`
declaration, and that selector beats the universal `*, *::before, *::after` in the
cascade, so without the flag this override loses to it and the footer's children keep
fading under reduced motion.

This block does not reach the scroll-driven fades, and that is correct rather than a
gap. Every element using `animation-timeline: scroll(...)` has its animation progress
driven by scroll position, not by `animation-duration` — collapsing the duration to
`.01ms` is a no-op for a timeline that was never reading duration in the first place. A
mask that tracks scroll position has no autoplay and moves only as fast as the reader
scrolls; that is not the kind of motion `prefers-reduced-motion` is about. Anything on
this page that is actually clock-driven is caught by the block above.

## Responsive

The page layout adapts with `@media`, because the viewport itself is the condition being
tested. Components (fields, dropdowns, list items) instead adapt with `@container`,
because the same component has to work correctly in whatever slot it lands in,
regardless of the viewport. `layout.md` carries the rules every layout's breakpoints keep
and the `.field-body` container example — read it there; this file does not repeat it.
