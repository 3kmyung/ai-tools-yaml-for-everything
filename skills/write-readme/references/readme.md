## 언어

세트와 번역 범위는 `references/language.md`가 정한다. 이 파일의 섹션에만 해당하는 규칙은 하나다. 렌더(Render) 스크립트(Script)가 뽑는 부분은 README마다 그 파일의 언어로 `--language`를 줘서 한 번씩 렌더하고, 출력 그대로 옮긴다.

| 파일 | `--language` |
| :---: | --- |
| `README.md` | `en` |
| `README.ko.md` | `ko` |
| `README.zh-cn.md` | `zh-cn` |

`<scratch>`는 세션(Session)의 스크래치패드(Scratchpad) 폴더다.

## 제목

제목은 `# <example>`, 서비스 폴더 이름 그대로이고 번역하지 않는다. 그 아래 한 문장은 서비스에 무엇이 들어가고 무엇이 나오는지만 쓰고, README의 언어로 쓴다.

| 문장에 들어가는 것 | 출처 |
| :---: | --- |
| 들어가는 것 | `model-compose.yml` 워크플로(Workflow)의 입력 |
| 나오는 것 | 워크플로의 `output`, 없으면 마지막 job의 `output` |
| 출력의 형식(e.g., 샘플레이트, 채널) | yml이나 드라이버(Driver)가 정한 값, 없으면 쓰지 않는다 |

```
✗ # speech-recognition-whisper

  A fast, accurate speech recognition service powered by Whisper.
→ # speech-recognition-whisper

  This service takes an audio file and returns its transcript with a timestamp for every line.
Why: the reader needs what goes in and what comes back, read from the workflow's inputs and
output. "Fast" and "accurate" are figures nobody measured here, and the model's name
belongs to the Model section.
```

## 모델

모델(Model)이 무엇인지와, 뻔한 대안이 하지 않는 일을 하는 아키텍처(Architecture) 특징 하나를 쓴다. 서비스가 모델을 어떻게 쓰는지(워크플로가 나눈 job, 넘기는 옵션, 출력 키)는 쓰지 않는다. 무엇이 들어가고 나오는지는 제목 아래 문장이 이미 말한다.

모델에 관한 모든 사실(이 섹션, `빠른 시작`의 체크포인트(Checkpoint), `라이선스`)은 아래 출처에서만 가져오고, 모델 이름에서 추측하지 않는다. `<checkpoint>`는 `validate_results.py` 리포트(Report)의 `benchmark.checkpoint.id`다.

| 출처 | 찾는 법 |
| :---: | --- |
| 모델 카드(Model Card) | `https://huggingface.co/<checkpoint>/raw/main/README.md` |
| 체크포인트 파일 목록 | `https://huggingface.co/api/models/<checkpoint>`의 `siblings` |
| 모델 리포지터리(Repository) | 모델 카드 원문 어디든(배지 링크 포함) 링크한 GitHub 리포지터리, 하나면 그것, 없거나 여럿이면 `AskUserQuestion`으로 확인 |
| 모델 리포지터리 파일 목록 | `https://api.github.com/repos/<owner>/<repository>/contents/` |
| 논문 | 모델 카드 원문이 링크한 arXiv 페이지 |

```bash
curl -sL "https://huggingface.co/<checkpoint>/raw/main/README.md"
curl -sL "https://huggingface.co/api/models/<checkpoint>" | python -B -c "import json,sys; print(*[s['rfilename'] for s in json.load(sys.stdin)['siblings']], sep='\n')"
curl -sL "https://huggingface.co/<checkpoint>/raw/main/<file>"
curl -sL "https://raw.githubusercontent.com/<owner>/<repository>/HEAD/<file>"
```

`WebFetch`는 요약본을 돌려주므로 모델 카드와 라이선스(License)에는 쓰지 않는다.

```
✗ "This service splits that process into two jobs. The `score` job writes a melody score
  with `cot_mode: melody`, and the `cover` job sings that score."
→ Leave the paragraph out; the section ends after the model's own architectural point.
Why: the section is read as what the model is. A paragraph about the workflow's jobs
describes this service's yml, which the reader can open, and blurs which claims come
from the model card and which from this service.
```

```
✗ "A 32-layer encoder-decoder transformer reads an 80-bin log-Mel spectrogram, a
  byte-level BPE decoder writes the text, and timestamp tokens are interleaved with it."
→ "It writes timestamp tokens alongside the text, so every line comes back already
  aligned to the audio."
Why: a walk through every stage is the model card again, and it buries the one point the
reader came for under the parts every model of its kind shares.
```

## 데모

캡처한 GIF마다 이미지 줄 하나, 섹션에 그 밖의 것은 없다. 캡처에 실패한 GIF는 빼고, 다른 화면의 스크린샷으로 대체하지 않는다.

```
✗ ![demo](docs/images/<example>.gif)
  An electric-violin style prompt with Japanese lyrics comes back as a 2 minute 34 second
  song and the melody score it was sung from.
→ ![An electric-violin style prompt and Japanese lyrics come back as a song and its score](docs/images/<example>.gif)
Why: the GIF already shows what went in and what came out. A sentence beside it restates
the screen, and it drifts toward how the GIF was made or how long one unmeasured run took,
which belongs to the Performance section. The alt text says what the GIF shows, for a
reader whose image did not load.
```

## 빠른 시작

버전 줄로 시작하고, 그 아래를 설치·클론(Clone)·실행 세 단계로 나눈다. 단계마다 무엇을 하는지 한 문장을 쓰고 그 아래에 명령 블록 하나를 둔다. 설치 단계만 uv와 pip 두 갈래여서 문장과 블록을 두 벌 가진다. 독자는 이 리포지터리가 아니라 `github.com/MindrLabs/<example>`을 클론했으므로 어떤 단계도 `releases/`를 언급하지 않는다.

````
It needs [model-compose](https://github.com/hanyeol/model-compose) <version> or later.

Install with [uv](https://docs.astral.sh/uv/):

```bash
uv pip install model-compose
```

Or with pip:

```bash
pip install model-compose
```

Clone this repository:

```bash
git clone https://github.com/MindrLabs/<example>
cd <example>
```

Run it:

```bash
model-compose up
```
````

이 골격은 model-compose 업스트림(Upstream) README의 `Quick Start`를 그대로 따른 것이라 서비스와 무관하게 고정이고, 단계를 더하거나 합치지 않는다. uv 갈래를 먼저 두고 pip을 대안으로 두는 순서도 바꾸지 않는다. 기기에 먼저 있어야 하는 것(e.g., CUDA GPU)은 단계가 아니라 블록 아래 문장으로 쓴다.

```
✗ One sentence, then one block holding pip install, git clone, cd and model-compose up.
→ A sentence per step, each followed by the block that carries only its own commands.
Why: one block of four lines is one thing to copy, so a reader who already has
model-compose installed still pastes the install line, and a failure anywhere in the block
gives no clue which step it belongs to.
```

각 단계의 문장과 버전 줄은 README의 언어로 쓰고, 모든 언어에서 `model-compose`를 링크한다. 단계 문장은 언어와 관계없이 콜론으로 끝낸다. 한국어는 서술형 종결을 쓰지 않고 `설치`, `클론`, `실행`처럼 명사로 끊는다.

```
✗ [uv](https://docs.astral.sh/uv/)로 설치합니다.
  또는 pip으로 설치합니다.
  이 저장소를 클론합니다.
→ [uv](https://docs.astral.sh/uv/)로 설치:
  또는 pip로 설치:
  이 저장소 클론:
Why: the line labels the block under it rather than closing a thought, and the English and
Chinese READMEs already label it with a colon. `합니다.` reads as prose the reader is meant
to finish, which puts a full stop where the block has to follow.
```
 `<version>`은 아래 스크립트가 출력한 값이다. 릴리스는 `upstream/main`에서 돌아야 하므로 `--ref`는 기본값 `upstream/main`을 쓴다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/find_version.py"
```

| 종료 코드(Exit Code) | 행동 |
| :---: | --- |
| `0` | 출력한 버전을 `<version>`에 넣는다 |
| `1` | **중단** → 검증한 소스를 담은 릴리스가 아직 없다고 보고, 버전을 추정하지 않는다 |
| `2` | 오류를 그대로 보고 |

```
✗ It needs [model-compose](https://github.com/hanyeol/model-compose) 0.4.112 or later.   (the latest on PyPI is 0.4.111, plus one)
→ It needs [model-compose](https://github.com/hanyeol/model-compose) 0.4.111 or later.   (what find_version.py printed)
Why: "latest plus one" guesses at a release nobody has published. Once upstream releases,
the guess points past every installable version.
```

그다음 인터페이스(Interface)가 열리는 URL, 첫 실행이 내려받는 것과 대략의 크기, 둘이 동작하려면 기기에 먼저 있어야 하는 것을 쓴다. 각 값은 아래 출처에서만 가져오고, 다른 예제의 README에서 가져오지 않는다.

| 값 | 출처 |
| :---: | --- |
| 포트, 환경 경로, 디바이스(Device), 동시 실행 수 | 서비스의 `model-compose.yml` |
| 첫 실행이 설치하는 패키지(Package), 드라이버가 기본으로 로드하는 체크포인트 | yml이 고른 업스트림(Upstream) 드라이버 코드, `git show upstream/main:<path>` |
| 내려받는 크기 | 허브(Hub) API의 파일 크기, `https://huggingface.co/api/models/<checkpoint>?blobs=true` |

호출자가 보는 동작을 바꾸는 yml 설정(e.g., 두 번째 요청을 대기시키는 `max_concurrent_count`)도 쓴다.

```
✗ "The default device is CUDA; set `DEVICE` for any other."
→ "`DEVICE` defaults to `cuda`, so a CUDA GPU is required."
Why: the Limits section already says the MPS run failed. A device the measurement never
got working is not offered as an alternative, and the Quick Start section never contradicts
Limits.
```

## 성능

`yaml-for-everything:analyze-model`이 측정을 검증해 리포트를 출력하고, 이 스킬(Skill)의 두 스크립트가 그 리포트를 표와 `Measurement conditions` 블록으로 바꾼다. 셋 다 클론 루트(Root)에서 실행한다.

```bash
python -B "${CLAUDE_SKILL_DIR}/../analyze-model/scripts/validate_results.py" \
  workspaces/<example>/analysis/results \
  --benchmark workspaces/<example>/analysis/benchmark.json \
  --accuracy-directory workspaces/<example>/analysis/accuracy > <scratch>/report.json
python -B "${CLAUDE_SKILL_DIR}/scripts/render_table.py" <scratch>/report.json --language <language>
python -B "${CLAUDE_SKILL_DIR}/scripts/render_conditions.py" <scratch>/report.json --language <language>
```

| 스크립트 | 종료 코드 | 행동 |
| :---: | :---: | --- |
| `validate_results.py` | `1` | 우회하지 않고 `yaml-for-everything:analyze-model`로 넘긴다 |
| `render_table.py` | `2` | 짚은 기기 ID를 `assets/machines.json`에 표시명과 함께 추가하고 재렌더 |

기기는 README에서 벤치마크(Benchmark) 파일의 ID가 아니라 `assets/machines.json`의 표시명으로 쓴다(`rtx-4090`이 아니라 `RTX 4090`). 표시명은 제조사가 쓰는 제품명 그대로, 모든 언어에서 같다. 콜아웃(Callout)을 포함해 손으로 쓰는 모든 문장이 같은 표시명을 쓴다.

표에 없는 열은 그 워크플로에서 기록되지 않은 지표다. 채울 빈칸이 아니다.

```
✗ Retyping the table into the README, or converting a unit to make two rows look alike.
→ Paste what the script printed. When a column is missing, that metric was not recorded
  for this workflow, which is information rather than a gap to fill.
Why: a retyped table is where a wrong split, a dropped precision label or a unit that
silently changed enters. The script reads the report; a person reads the script's output.
```

`Runtime`, `Build`, `Numerics`가 다른 행이 섞이면 속도 열이 두 가지를 동시에 뜻한다. 표의 노트가 이미 그렇게 말하고, 해석은 노트와 어긋나지 않는다.

```
✗ "The Mac is six times slower than the 4090."
→ "The Mac, running a 4-bit conversion, is six times slower than the 4090 running the
  float16 checkpoint. That gap mixes hardware with the build, and this table cannot
  separate them."
Why: the first sentence attributes to the machine a difference the table never isolated.
```

### 측정 방법

`Measurement conditions` 블록은 데이터셋(Dataset), 지표와 버전, 체크포인트 리비전(Revision), 정확도 방식, 공개 점수를 스크립트가 만든 링크와 함께 이미 담는다. 행마다 다르면 런타임(Runtime), 빌드(Build), 수치 형식도 표의 열로 들어간다. README는 둘을 그대로 싣고 다시 풀어 쓰지 않으며, 어느 파일에도 없는 것(호출자가 손으로 준 값)만 더한다.

정확도 행은 방식만 적고, 측정이 통과하지 못한 검사는 `benchmark.json`에 두고 README에 나열하지 않는다. `accuracy.method`가 `machine_distance`면 공개 점수와 전혀 비교하지 않은 것이므로, 수치는 기기끼리 일치한다는 것만 보여 주고 절대 정확도에 대해서는 말하지 않는다.

```
✗ Writing the dataset id, the split, the metric version or the published score into
  prose beside the block that already carries them.
→ Cite the block. One statement of a figure per README.
Why: two copies of the same figure drift, and the prose copy is the one without a link
back to the file it came from.
```

### 해석

```
✗ A performance table with no prose around it.
→ At least one interpretation sentence per table, reading whichever throughput column the
  table actually carries — for a service measured in RTF, "the 4090 leads at an RTF of
  0.08, but the MacBook's 0.4 is still 2.5 times faster than real time, so a laptop keeps
  up."
Why: a bare table goes unread. The sentence is what carries the result to a reader who
will not do the division themselves, and the division to do depends on the column — a
ratio needs comparing against 1, a rate against the length the reader has in mind.
```

해석은 표 노트 바로 아래 GitHub 콜아웃 하나에 두고, 노트를 반복하지 않는다.

```
> [!NOTE]
> <what the throughput column means for each row, in the README's language>
```

유리한 행만 인용하지 않는다. 데모의 도메인(Domain)이 모델의 가장 나쁜 공개 결과라면 그 행을 단서와 함께 섹션에 싣고, 각주로 밀거나 빼지 않는다.

## 한계

섹션 본문은 아래 스크립트 출력 그대로다. 측정 행이 없는 기기마다 한 줄, 정확도 방식의 고정 문장 한 줄이다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/render_limits.py" workspaces/<example>/analysis --language <language>
```

| 종료 코드 | 행동 |
| :---: | --- |
| `0` | 출력 그대로 옮긴다 |
| `2` | 기기 ID가 없으면 `assets/machines.json`에 추가, 그 밖은 오류를 그대로 보고 |
| `3` | 짚은 `unmeasured/<machine>.json`의 `reason`을 그 언어로 옮겨 `reasons.<language>`에 추가하고 재실행 |

`reasons`는 이 스킬이 `workspaces/<example>/`에 쓰는 유일한 값이다. 한 번 옮긴 문장을 파일에 남겨 재렌더할 때마다 같은 문장이 나오게 한다.

```
✗ Model-card facts (declared languages, hardware in the quick start, what a mode does),
  restated notes the table already prints, observations from runs outside analysis/,
  or how reproducible the outputs looked.
→ Leave each one out. The card is linked from the Model section; the table's notes sit
  under the table; a run outside the measurement has no condition the README can state.
Why: every extra line here is one a reader has to weigh against the two that matter,
and a copied card fact goes stale the day the card changes.
```

## 라이선스

표 하나만, 라이선스 원문 인용도 앞뒤 문장도 없다.

```
| Covers | License | Commercial use |
| :---: | --- | :---: |
| This service | [`LICENSE`](LICENSE) | ✓ |
| `stabilityai/stable-audio-open-1.0` weights | [`MODEL_LICENSE`](https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md) | ✗ |
| Use by an organisation under $1M in annual revenue | [`MODEL_LICENSE`](https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md) | ✓ |
```

| 열 | 담는 것 |
| :---: | --- |
| Covers | 그 행의 라이선스가 다루는 대상, README의 언어로 짧은 명사구(이 서비스, 체크포인트 가중치, 한 사용자 집단이 그것으로 만드는 것) |
| License | 링크, 서비스 자체 파일은 [`LICENSE`](LICENSE), 업스트림 문서를 가리키는 행은 파일 이름·라이선스 이름·문서 제목과 관계없이 모두 `MODEL_LICENSE` |
| Commercial use | `✓` 또는 `✗`만 |

첫 행은 항상 이 서비스의 `LICENSE`다. 그 뒤에는 리포트의 `checkpoint`만 행을 가진다. 드라이버 기본값으로만 로드되는 체크포인트(e.g., 디코더)는 행이 없다.

읽을 파일은 체크포인트와 모델 리포지터리 두 곳 모두의 루트에서 이름에 대소문자 구분 없이 `LICENSE`나 `LICENCE`가 들어간 파일 전부, 그리고 두 곳의 README다. 파일 목록은 `모델`의 출처 표로 얻는다. 파일마다가 아니라 가중치에 대한 서로 다른 권한마다 한 행을 둔다.

| 읽었지만 행이 없는 파일 | 이유 |
| :---: | --- |
| 하위 폴더(e.g., `licenses/`)의 파일, 이름에 `NOTICE`나 `THIRD_PARTY`가 들어간 파일 | 함께 배포된 다른 구성 요소의 고지 |
| 모델 리포지터리의 코드 라이선스(e.g., Apache 2.0 `LICENSE`) | 가중치가 아니라 리포지터리 코드를 다룬다 |

| 행 | 링크할 파일 |
| :---: | --- |
| 가중치 행 | 체크포인트 쪽 라이선스 파일, 같은 제목의 파일이 모델 리포지터리에도 있으면 모델 리포지터리 쪽 |
| 권한을 더하는 행 | 그 권한을 실제로 적은 파일 |

| 문서 | 행 |
| :---: | --- |
| 카드 자체 라이선스 파일 | 그 파일을 링크한 한 행 |
| 한 집단에 대해 제약을 풀어 주는 파일 | 그 파일을 링크한 행 하나 추가, 어느 라이선스의 제약을 푸는지 밝히지 않아도 추가 |
| 기본 라이선스가 막은 상업적 이용을 허용하지 않는 문단 | 행을 두지 않는다 |
| 모든 파일을 읽었는데 라이선스를 밝힌 곳이 없다 | 가중치 행 하나, 모델 카드 페이지를 `MODEL_LICENSE`로 링크, `✗` |

```
✗ | `<org>/<model>` weights | [`CC BY-NC 4.0`](https://huggingface.co/<org>/<model>/blob/main/LICENSE) | ✗ |
  | Songs an individual creator makes with them | [`<Model> model-weight license`](https://github.com/<owner>/<repository>/blob/main/MODEL_LICENSE) | ✓ |
→ | `<org>/<model>` weights | [`MODEL_LICENSE`](https://github.com/<owner>/<repository>/blob/main/MODEL_LICENSE) | ✗ |
  | Songs an individual creator makes with them | [`MODEL_LICENSE`](https://github.com/<owner>/<repository>/blob/main/MODEL_LICENSE) | ✓ |
Why: every upstream row carries the same label, so the table reads the same across
services. A license name or a document title picked for the label is a reading of the
document, and the link already carries its text. When the checkpoint's LICENSE and the
repository's MODEL_LICENSE share a title, the repository copy is the one upstream edits,
so both rows link it.
```

```
✗ | `stabilityai/stable-audio-open-1.0` weights | [`MODEL_LICENSE`](…) | ✓ under $1M revenue, ✗ above |
→ | `stabilityai/stable-audio-open-1.0` weights | [`MODEL_LICENSE`](…) | ✗ |
  | Use by an organisation under $1M in annual revenue | [`MODEL_LICENSE`](…) | ✓ |
Why: the commercial cell holds one mark. When a file grants commercial use to one group
that the base license denies everyone, the grant is its own row, and the group and what it
may sell move into Covers, where they are translated with the rest of the README.
```

```
✗ | Use of the weights by any organisation, company or individual whose total annual revenue is below USD 1,000,000 | … | ✓ |
→ | Use by an organisation under $1M in annual revenue | … | ✓ |
Why: Covers names the group and what it may do, and the link carries the wording. A
clause copied into the cell is the license quote again, split across a table row.
```

```
✗ A code block of the upstream text under the table, or "Larger companies need an
  enterprise license from Stability AI."
→ The table alone.
Why: the link already carries the text, and a summary in the README's own words rounds
away the condition a reader needed.
```

## `LICENSE` 파일

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/write_license.py" releases/<example>
```

| 출력 | 뜻 |
| :---: | --- |
| `wrote` | `MindrLabs` 명의의 MIT License를 올해 연도로 새로 썼다 |
| `kept` | 이미 있는 `LICENSE`를 그대로 두었다, 연도도 바뀌지 않는다 |

종료 코드 `2`면 경로를 확인한다. `LICENSE`는 서비스 자체 파일만 다루고, 가중치는 라이선스 표의 다음 행들을 따른다.

## README에 넣지 않는 것

```
✗ Example: `https://github.com/<owner>/<repository>/tree/<branch>/releases/<example>`
→ Leave the line out.
Why: the reader is already in that directory when the README is on screen, and a link to
it only points back at the page being read.
```

출처와 조건이 명시되지 않은 수치는 단서를 달아 넣지 않고 뺀다. 단서가 붙어도 수치는 단서를 읽지 않을 독자 앞에 놓이므로, 빼는 것만이 실제로 통하는 방법이다.
