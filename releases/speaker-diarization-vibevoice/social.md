# X post — VibeVoice-ASR

Korean, X only. One post and one reply to it.

## Post — attach `media/speaker-diarization-vibevoice.png` and `media/rtf-table.png`

```
회의 녹음을 넣으면 누가, 언제, 무슨 말을 했는지 한 번에 받아 적는 VibeVoice-ASR을 model-compose로 돌려봤습니다 🎙️

RTX 4090에서 17분 30초짜리 4인 회의를 3분 54초 만에 끝냈습니다 ⚡

머신 3대 속도는 표로 붙였습니다 👇
```

Weighted length 216/280, from `assets/post-length.mjs`. The one number is the 4090's
233.53-second run over 1049.35 seconds of audio, from `benchmarks/results/rtx-4090.json`.

`media/rtf-table.png` was rendered by `assets/rtf-table.mjs` from `rtx-4090.json`,
`dgx-spark.json` and `macbook-m1.json`. `rtx-4090-smoke.json` is left out because it
ran 60 seconds of audio against the others' 1049.35.

## Reply to the post

```
https://github.com/<owner>/<repository>/tree/releases/speaker-diarization-vibevoice/releases/speaker-diarization-vibevoice
```

## What this post does not say

The model card states the MIT licence and no out-of-scope use, no deployment
restriction and no responsible-AI limitation, so there is no usage-scope quote to carry.
The post stops short of recommending deployment, which is advice the model's own authors
did not give.
