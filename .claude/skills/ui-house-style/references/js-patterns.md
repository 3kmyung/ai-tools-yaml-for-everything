# js-patterns.md

Read this before writing any `.js` module for the UI. The reference at
`releases/youtube-to-playlist-video/ui/src/` follows every rule below
throughout; when in doubt, open the module that already does the thing you are about to
write and match its shape rather than inventing a new one.

## Module shape

Every file is an ES module with named exports only.

```
✗ export default function ColorPicker() { ... }
→ export function openColorPicker(options) { ... }
Why: a default export has no name at the export site — every importer chooses its own
name for the same thing, and a project-wide search for who uses openColorPicker finds
every call site only when the name is the same everywhere.
```

No `class`. State that would live on `this` lives in module-scope variables (as
`dropdown.js` holds its open menu and current anchor) or in a plain object a factory
function returns.

```
✗ class ReopenGuard { record(anchor) { ... } blocks(anchor) { ... } }
→ function createReopenGuard() {
    let dismissedAnchor = null;
    let dismissedAt = 0;

    return {
      record: (anchor) => { dismissedAnchor = anchor; dismissedAt = Date.now(); },
      blocks: (anchor) => anchor === dismissedAnchor && Date.now() - dismissedAt < 250,
      clear: () => { dismissedAnchor = null; },
    };
  }
Why: a createX() factory returning an object literal gets the same encapsulation a class
gives, with no constructor, no this, and no prototype chain to reason about. popover.js's
createReopenGuard is the shipped example.
```

## Building and updating the DOM

No `innerHTML`, and no template-string HTML. Build elements with `document.createElement`
(or `createElementNS` for SVG) and assign their properties with `Object.assign` or plain
property assignment; assemble a tree with `appendChild`.

```
✗ container.innerHTML = `<span class="item-label">${title}</span>`;
→ const label = Object.assign(document.createElement("span"), {
    className: "item-label",
    textContent: title,
  });
Why: a string built from interpolated data and reparsed as HTML is exactly how markup
injection happens, and it throws away every property the platform would otherwise let
you assign directly and safely.
```

When a region's whole content changes at once — a rendered list, a status message —
replace it with `replaceChildren(...)` rather than clearing and re-appending by hand.

```
✗ while (list.firstChild) list.removeChild(list.firstChild);
  tracks.forEach((track) => list.appendChild(renderItem(track)));
→ list.replaceChildren(...tracks.map(renderItem));
Why: replaceChildren does the clear-then-fill in one call with no intermediate empty
state for a layout observer or a screen reader to see, and it cannot leave a stray node
behind from a loop that exits early.
```

## Hiding

Hide an element with its `hidden` attribute, never `element.style.display`.

```
✗ element.style.display = "none"; / element.style.display = "flex";
→ element.hidden = true; / element.hidden = false;
Why: style.display is a second, inline source of truth that overrides whatever
components.css or layout.css decided for that element, and CSS cannot read it back the
way it can read the hidden attribute with a plain :not([hidden]) selector — which is how
the footer's own self-hiding rule in layout.md works.
```

## Naming

No abbreviated identifiers. Write `identifier`, `sequence`, `parseFailure` — never `i`,
`ctx`, `el`, `e`. This includes loop counters and catch bindings, which are exactly where
abbreviation habits hide the longest.

```
✗ for (let i = 0; i < options.length; i++) { ... }
  } catch (e) { ... }
→ for (let index = 0; index < options.length; index++) { ... }
  } catch (parseFailure) { ... }
Why: a name spelled out is searchable and self-describing at the call site six months
later; i and e carry no information beyond "this is some loop variable" and "this is
some error," which the syntax already told the reader.
```

## Comments

No comments in any file. Reasoning that would go in a comment goes in the commit message
that introduced the code instead.

```
✗ // guard against reopening the menu we just closed
  if (reopenGuard.blocks(anchor)) return;
→ if (reopenGuard.blocks(anchor)) return;
Why: a comment drifts from the code next to it the first time the code changes and
nobody updates the sentence describing it. A commit message is checked once, at review
time, against the diff it describes, and is never silently out of date afterward.
```

## Paragraphs

A function body reads as declaration, then work, then return, each its own paragraph
separated by a blank line — not one dense block. `popover.js`'s `trackPlacement` is the
shipped example, quoted verbatim:

```js
export function trackPlacement(anchor, element) {
  const reposition = () => placePopover(anchor, element);

  window.addEventListener("resize", reposition);

  return () => window.removeEventListener("resize", reposition);
}
```

## File size

One file, one concern. `hex.js` converts between hex strings and channel arrays and does
nothing else; `popover.js` places and repositions a popover and does nothing else. 100
lines is not a ceiling this reference holds itself to — `app.js` orchestrates the whole
screen and `websocket-client.js` carries the whole wire protocol, and both run well past
it. Past 100 lines, ask whether the file has quietly picked up a second concern; split
only when the answer is yes, not because a line counter tripped.
