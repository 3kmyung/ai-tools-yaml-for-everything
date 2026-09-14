# self-critique.md

Step 7. Re-read the written code and the fast loop's screenshots against every line.

- Invented a new colour instead of using a token from `tokens.md`?
- Written a `border`, `outline`, or `outline-offset` width as a literal instead of
  `var(--border-width)`?
- Painted a category marker with anything but a `--category-*` token, or put one on text?
- Used `box-shadow` anywhere?
- Toggled visual state from JavaScript instead of a CSS selector reading the DOM?
- Styled anything in `components.css` by ID, or named a class after this example's
  domain instead of its role?
- Left a comment in any file?
- Skipped a focus-visible indicator, or removed one without supplying a replacement in
  the same declaration?
- Ignored `prefers-reduced-motion` on a transition or animation that is not scroll-driven?
- Hand-drawn icon path data instead of copying it from Lucide?
- Left an output the reader can see but not save?
- Copied the list-and-workspace layout for a model whose output does not fit it?
