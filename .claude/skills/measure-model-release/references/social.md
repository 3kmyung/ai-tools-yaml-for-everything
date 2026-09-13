# social.md

One template. X only, Korean only: exactly one post within X's 280-character weighted
limit, and exactly one reply to it that holds the GitHub link and nothing else.

## Voice

The post is friendly SNS Korean in 합니다체: short sentences, spoken to the reader,
ending in -습니다, -입니다, -ㅂ니다, or -ㄹ까요? for a question, with one or two emoji in
the whole post. Every sentence is about the model or the run; the attachments sit
directly under the text, so no sentence points at them. The post is plain text — X
renders `**`, `#`, `-` lists and `|` tables as the literal characters.

```
VibeVoice-ASR로 한 시간짜리 회의 녹음을 N분 만에 받아 적었습니다 🎙️
누가 언제 무슨 말을 했는지까지 한 번에 나옵니다.
```

## The template

```
Post (≤280 weighted characters, Korean)
  - one line on the model
  - exactly one performance number in the text
  - one or two emoji
  - attached: the demo media and the RTF table image

Reply to the post
  - the GitHub URL of the example's directory, alone
```

The link goes in a reply because a link in the post itself measurably reduces that
post's reach on X. The model, the number, the media and the table are already in the post
the reader is looking at; the link is one tap away.

## Five required elements

| Element | Where | Rule |
|---|---|---|
| One line on the model | post | states what it is, not a pitch |
| Exactly one performance number | post text | RTF, or "an hour in N minutes" |
| The demo media | post | attached directly |
| The RTF table image | post | attached directly, rendered by `assets/rtf-table.mjs` |
| The GitHub URL | reply | the URL and no other character |

```
✗ Two performance numbers in the post text — for example RTF and peak video memory
  together.
→ One number in the text. The table image carries that same metric for every machine,
  and nothing else.
Why: the post has one thing to say, not the whole report. A second metric competes with
the first for the reader's five seconds of attention and both lose.
```

## The RTF table image

`assets/rtf-table.mjs` reads result files, or every `*.json` in a results directory, and
renders one row per valid result on a white background: the machine, its RTF, and a note
on any row whose runtime or quantization differs from the `model-compose` baseline. Rows
are sorted fastest first; an invalid run is skipped and named on standard error.

```
node assets/rtf-table.mjs releases/<example>/benchmarks/results/<machine>.json... \
  --output=releases/<example>/media/rtf-table.png \
  --label=<machine>=<display name>
```

Pass one `--label` per machine so the image shows a name a reader recognises rather than
the result file's slug. Results over different audio lengths stop the render with the
machines grouped by length, since RTF grows with length. A results directory that also
holds a short smoke run takes its files named one by one.

## The length check

X weighs characters: Hangul and every other CJK character count 2, each emoji counts 2,
Latin letters, digits, spaces and line breaks count 1, and any URL counts 23 whatever its
length. A Korean post therefore holds roughly 140 characters, not 280.

```
node assets/post-length.mjs <post.txt>
```

It prints the weighted length against 280 and exits non-zero above it. Run it on the post
text before handing the post over.

## The one prohibition

```
✗ The post reads as advice to deploy the model — "빠르고 정확해서 바로 프로덕션에 써도
  됩니다" or anything with that shape.
→ The post describes what the demo did and stops there. When `build-model-release`'s
  research step recorded a usage-scope restriction, the report in the linked directory
  carries it verbatim.
Why: a one-post format has no room for the usage-scope quote, so the post must not make
the claim that quote exists to qualify. Giving shipping advice the model's own authors
decline to give is the one way this post can do real harm, and it costs nothing to avoid.
```
