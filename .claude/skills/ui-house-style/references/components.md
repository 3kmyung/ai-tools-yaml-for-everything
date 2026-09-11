# components.md

Assemble a screen from these first; write a new widget only when none of them fits.
Every class name below is checked against the shipped `components.css` — a name that
does not appear there does not belong in a generated UI. Superseded names such as
`track`, `track-label`, `remove-track`, and the ID selector `render-playlist` are not
vocabulary; they are the domain-noun mistake `css-patterns.md` bans, and its ban list is
where they live.

## Field — `.field`, `.field-body`, `.field-control`, `.field-line`

```html
<div class="field" data-field="title">
  <div class="field-body">
    <label class="field-label" for="field-title-0">Title</label>
    <div class="field-control">
      <div class="field-line">
        <input type="text" id="field-title-0" value="" placeholder="" />
      </div>
    </div>
  </div>
  <button class="revert-field" type="button" disabled>…</button>
</div>
```

`.field` is the outer row: the editable value plus its own `.revert-field` button.
`.field-body` holds the label above the control. `.field-control` gets `.is-default`
whenever the value is a derived default the reader has not overridden — text dims to
`--disabled` and turns italic. `.revert-field` is disabled exactly while `.is-default`
holds; there is one boolean, read in two places, not two booleans that can disagree.

A field whose control is an image or a colour swatch — `.field-control` containing a
`.thumbnail-frame` — lays out as a row instead of a column; `layout.md`'s breakpoint
section already carries the exact container query that narrows it back to a column, and
is not repeated here.

A file-picking field hides its native `<input type="file">` behind `.field-file-input`
and drives selection through the `<label for>` it sits beside, never a synthetic click.

## Dropdown — `.dropdown`, `.dropdown-menu`, `.dropdown-option`

```html
<button class="dropdown" type="button" aria-haspopup="listbox" aria-expanded="false">
  <span>1080p</span>
  <svg class="icon">…chevron…</svg>
</button>
```

The menu is a sibling of every dropdown anchor, not a child: it is built once per open
and appended to `document.body`, positioned with `getBoundingClientRect` against its
anchor, and repositioned on `resize` while open. It carries `popover="auto"` and
`role="listbox"`; each `.dropdown-option` is a `role="option"` button with
`aria-selected`, and the selected option's trailing `.icon` (a check mark) is the only
one left `visibility: visible` — the rest hide with `visibility: hidden` so the row
height never changes as selection moves. Arrow Up/Down step between options, Home/End
jump to the first/last, and closing the menu returns focus to the anchor.

A menu that closes and reopens from the same pointer gesture must not flash back open:
record the dismissal and its timestamp, and swallow an open request against the same
anchor within roughly a quarter second of its own dismissal.

```
✗ A popover positioning library.
→ getBoundingClientRect on the anchor and the popover, clamped to the viewport, as
  popover.js already does.
Why: the placement math here is one clamp in each axis. A library earns its weight when
placement needs collision-aware flipping across many anchors with different growth
directions; this one does not.
```

## List item — `.item`, `.item-select`, `.item-label`, `.item-remove`

```html
<li class="item is-selected" data-item="track-1">
  <button class="item-select" type="button">
    <span class="thumbnail-frame"><img class="thumbnail" alt="" src="…" /></span>
    <span class="item-label">Track 1</span>
  </button>
  <button class="item-remove" type="button" aria-label="Remove track">
    <svg class="icon">…</svg>
  </button>
</li>
```

`.item-select` carries the thumbnail and the label and is the whole clickable row; it is
a `<button>`, not a `<div>` with a click handler, so it is reachable and activatable from
the keyboard for free. `.item-remove` carries only an icon, so it always needs an
`aria-label` — an icon with no visible text and no accessible name is a control a screen
reader cannot describe. Selection state is `.is-selected` on the `<li>`, read by CSS for
both the border-colour change and the hover suppression (`.item:not(.is-selected)` is
the only one that gets the hover tint); nothing else keys off it.

## Action buttons — `.action-primary`, `.action-add`, `.action-cancel`, `.action-resume`

`.action-primary` and `.action-resume` are filled: an accent background with
`--background` text, reserved for the one constructive action a screen offers at a time.
`.action-add` and `.action-cancel` are outlined: transparent background, accent border
and text. A screen showing both a filled and an outlined action is choosing which one it
wants the eye to land on first — do not fill two buttons in the same view.

A button's label is not fixed text; it is state. `.action-cancel` and `.action-resume`
swap their own `textContent` and `disabled` attribute in place while an operation is in
flight ("Cancel" → "Cancelling…", disabled) rather than being replaced by a second
element or hidden in favour of a spinner. The header's `.action-primary` and the
footer's mirror it are two elements with the same job at two breakpoints, not a primary
button and a secondary one.

## Caption warning — `.caption-warning`

```html
<span id="warning" class="caption-warning" hidden></span>
```

`.caption-warning` is a plain `<span>` toggled with its own `hidden` attribute; there is
no separate warning widget to build. It shares the compact caption-text treatment
(`font-size: var(--text-sm)`) that `.field-label` and the colour picker's channel-name
and readout spans also use, but where that shared rule otherwise paints
`--text-caption`, `.caption-warning` overrides its own colour to `--accent-text` — the
one caption-sized label meant to be read as a warning rather than as quiet instructional
text, so it borrows the accent hue instead of the caption grey.

## Status bar — `.status-message`, `.status-trailing`, `.status-video`

The log region carries exactly one of: a `.status-message` span (plain text), a
`.status-message` beside a `.status-trailing` group (trailing action buttons, such as
`.action-cancel` during a render), or a `.status-video` element once a render finishes.
Replace the region's children wholesale with `replaceChildren()` for each state change;
do not leave a stale trailing group behind an updated message. The region's own
appearance and disappearance is `layout.md`'s footer self-hiding mechanism and is not
repeated here — a status widget only ever sets the log's `hidden` attribute and content,
never its visibility.

## Thumbnail and swatch — `.thumbnail`, `.thumbnail-frame`, `.color-picker-swatch`

`.thumbnail-frame` is the positioning wrapper; the scrim on its `::after` is the one
decorative gradient this house style budgets for anywhere (`css-patterns.md` bans every
other one). `.thumbnail` itself is either an `<img>` when a cover exists or a `<div>`
when it does not — swap the element, not the `src`, so a missing cover never requests a
broken image. `.color-picker-swatch` is the same `2.5rem`/`1.75rem` square used as a
button instead of an image, painted through the `--swatch` custom property rather than
`background-color` directly, so both the field's swatch and the picker's suggestion
swatches share one painting mechanism.

## Colour picker — the `.color-picker-*` family

One `.color-picker` popover is built lazily on first use and reused for every colour
field afterward; it is not rebuilt per field. It holds three `.color-picker-channel`
rows (R, G, B — each a `.color-picker-slider` plus a `.color-picker-readout`), a
`.color-picker-hex` text line, and a `.color-picker-suggestions` block of
`.color-picker-swatches` drawn from the active cover's extracted palette. Every channel
slider's `--from`/`--to` gradient stops repaint on every input so the track always shows
what moving the thumb in either direction would produce. `.color-picker-suggestions`
carries `hidden` rather than being removed from the DOM when a track has no cover to
draw suggestions from.

## Icons

```
✗ Hand-drawn path data, or a filled icon set mixed into an outline one.
→ Copy path data from Lucide's (ISC-licensed) upstream .svg files into the ICONS map —
  every path of a multi-path icon, and Lucide's own 24-unit viewBox left unchanged.
  Render at 16×16 with `.icon { stroke-width: 1.5 }`, `fill: none`, `aria-hidden="true"`.
Why: 24 unit at Lucide's own stroke-width 2 renders at 2 × 16/24 = 1.33px at 16px —
heavier than the 1px the hand-drawn icons it replaces had. 1.5 × 16/24 = 1.0px restores
that weight. This is arithmetic tied to the specific 24-to-16 scale-down, not a taste
preference, and does not move if the render size ever changes without recomputing it.
```

Take the path data from the upstream SVG file for each icon, not from lucide.dev: the
site is a JavaScript application with no static markup to read, and a fetch that
summarises through a model can paraphrase a `d` attribute without saying so. Invented
path geometry and copied path geometry are indistinguishable in a diff, which is exactly
why this one step cannot be delegated to a tool that summarises.

## Truncation

A label that must not wrap adds its selector to the existing shared truncation rule in
`components.css` — the one already carrying `.field-label`, `.item-label`,
`.dropdown-option > span`, `.status-message`, and `.status-trailing a` — rather than
writing a second block.

```
✗ A new rule repeating overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  for one more selector.
→ Add the selector to the existing comma-separated list that already declares those
  three properties once.
Why: three declarations copied per truncating element is three places a future change
to the truncation treatment has to be found and repeated identically; one shared rule is
one place.
```
