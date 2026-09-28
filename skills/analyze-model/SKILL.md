---
name: analyze-model
description: Use when measuring a model-compose workflow's run time or accuracy across machines, or when the user says "성능 측정", "정확도 비교", "기기별 속도", "benchmark".
allowed-tools: Read, Glob, Grep, Write, Edit, Skill, Bash(python *), PowerShell(python *)
---

## 절차

`<예제>`는 `releases/<예제>/model-compose.yml`의 예제 이름이며, 없으면 묻고 멈춘다. 표와 해석은 만들지 않고 `5`의 JSON만 내놓는다. 입력과 측정 산출물은 배포 폴더 `releases/<예제>/`에 두지 않고 `workspaces/<예제>/`에 둔다.

```
workspaces/<예제>/inputs/   실제 입력 파일

workspaces/<예제>/analysis/
├── benchmark.json          이 스킬 — 측정 명세와 잰 기기
├── inputs.jsonl            prepare.py — workspaces/<예제>/inputs/를 가리키는 항목 목록
├── results/<기기>.json     러너 — 측정값
├── outputs/<기기>/         러너 — 출력
├── accuracy/<기기>.json    score_outputs.py — 판정
└── unmeasured/<기기>.json  이 스킬 — 못 돌린 기기의 사유
```

### 1. 확인

| `workspaces/<예제>/analysis/`에 있는 것 | 시작할 곳 |
| --- | :---: |
| `benchmark.json`이 없다 | `2` |
| `benchmark.json`에 `machines`가 없다 | `3`, 기기를 고르는 것부터 |
| `results/`나 `accuracy/`가 빠진 기기가 있다 | `3`, 그 기기만 실행 |
| 모든 기기가 둘 다 있거나 `unmeasured/`에 있다 | `4` |

### 2. 측정 명세

채점 방법은 고르지 않고, 아래 질문에 출처로 답하면 `accuracy.method`가 정해진다.

| `accuracy.checks` | 거짓이면 |
| --- | :---: |
| `scorable`: 출력이 텍스트·오디오·이미지·영상 중 하나이고, 탐욕 디코딩(Greedy Decoding)이나 시드(Seed)를 받는 액션(Action)으로 같은 입력이 같은 출력을 낸다 | `person_judged` |
| `published_score`: 올린 체크포인트(Checkpoint)를 입력·출력을 바꾸는 컴포넌트(Component) 없이 돌린 공개 점수가 있다 | `machine_distance` |
| `reproducible_dataset`: 공개 점수의 데이터셋(Dataset)·분할·지표가 공개돼 있다 | `machine_distance` |
| `published_harness`: 점수를 낸 하네스(Harness) 커밋(Commit)·정밀도(Precision)·디코딩이 공개돼 있다 | `published_score`, 허용 오차만 `5%`→`10%` |

체크포인트를 올리는 컴포넌트가 없거나 허브(Hub)에 없으면 멈춘다. 출처가 말하지 않은 질문은 거짓으로 답하고, 자유 문장으로 덧붙이지 않는다. `references/benchmark-file.md`대로 쓰고 아래가 `0`일 때까지 고친다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/check_benchmark.py" workspaces/<예제>/analysis/benchmark.json
```

### 3. 실행

기기 선택·설치·전송은 `yaml-for-everything:run` 스킬(Skill)이 맡는다. 잴 기기는 이 스킬이 고르지 않으므로, 정해 주지 않으면 `yaml-for-everything:run`이 이 PC와 SSH 원격 기기를 사람에게 묻는다.

| `benchmark.json`의 `machines` | `yaml-for-everything:run`에 정해 주는 기기 |
| :---: | --- |
| 없다 | 정해 주지 않는다 → 연 직후 `ready`로 뜬 이름을 `machines`에 적는다 |
| 있다 | 결과가 없는 기기만 → 더 재라고 하면 다시 묻게 두고 `machines`에 더한다 |

고른 기기를 `open` 한 번에 모두 열고, 아래 하위 명령을 기기마다 `--machine <기기>`로 돌린다. 명령 앞부분의 형식은 `yaml-for-everything:run`이 정하고, 경로는 작업 폴더의 리포지터리(Repository) 루트(Root) 기준이다. `~/.cache`의 pip·uv·허브 캐시(Cache)는 지우지 않는다.

| `open`에 붙이는 `--package` | 언제 |
| --- | --- |
| `psutil`, `datasets`, `metric.requirements`의 각 항목 | 항상 |
| `transformers` | `tokenizer`가 `null`이 아니다 → 러너(Runner)는 토크나이저(Tokenizer)를 컴포넌트 `venv`가 아닌 자기 프로세스(Process)에 올린다 |
| `scipy`, `numpy` | `published_score` → 표본 오차를 부트스트랩(Bootstrap)으로 구한다 |

`open`은 `releases/<예제>/`만 보내므로 `workspaces/<예제>/analysis/`는 기기마다 올린다.

```bash
S=${CLAUDE_SKILL_DIR}; T=releases/<예제>; W=workspaces/<예제>; B=$W/analysis; R=.benchmark/runner; M=<기기>; F=<첫 기기>
upload --machine $M $S/scripts $R
upload --machine $M $B $B
```

`dataset.source`가 `files`면 입력 파일도 기기마다 올린다.

```bash
upload --machine $M $W/inputs $W/inputs
```

입력은 첫 기기에서 한 번만 만들어 나머지 기기에 보낸다. `inputs.jsonl`은 `$B`에, 실제 입력 파일은 `$W/inputs/`에 둔다.

| `dataset.source` | `prepare.py`에 주는 입력 |
| :---: | --- |
| `files` | `--files $W/inputs/<파일>...`, 파일은 옮기지 않고 그 자리에서 읽는다 |
| `huggingface` | `--dataset <name> --config <config> --split <split> --input-column <col> --reference-column <col> --sample-count <N> --seed <seed> --output-directory $W/inputs` |

```bash
execute --machine $F -- python -B $R/prepare.py --inputs-file $B/inputs.jsonl <위 표의 입력>
download --machine $F $B $W
upload --machine $M $B/inputs.jsonl $B/inputs.jsonl
```

`huggingface`면 `$W/inputs`도 받아 와 나머지 기기에 올린다.

```bash
download --machine $F $W/inputs $W
upload --machine $M $W/inputs $W/inputs
```

그 뒤는 기기마다 같다. 앞의 `measure.py`는 캐시를 덥히는 버리는 실행이고, 뒤가 기록용이다.

```bash
execute --machine $M --detach -- python -B $R/measure.py --compose-file $T/model-compose.yml --benchmark $B/benchmark.json \
  --inputs $B/inputs.jsonl --output-directory .benchmark/warmup/$M --results-directory .benchmark/warmup \
  --target <예제> --machine $M --build <빌드> --precision <정밀도> --quantization <양자화> --batch 1
status --machine $M
execute --machine $M --detach -- python -B $R/measure.py --compose-file $T/model-compose.yml --benchmark $B/benchmark.json \
  --inputs $B/inputs.jsonl --output-directory $B/outputs/$M --results-directory $B/results --target <예제> \
  --machine $M --build <빌드> --precision <정밀도> --quantization <양자화> --batch 1
status --machine $M
execute --machine $M -- python -B $R/score_outputs.py --benchmark $B/benchmark.json --inputs $B/inputs.jsonl \
  --outputs $B/outputs/$M --machine $M --accuracy-directory $B/accuracy
download --machine $M $B $W
close --machine $M
```

| 규칙 | 어기면 |
| --- | --- |
| `--detach`로 띄우고 `status`가 `exited`일 때까지 기다린다 | 이어 달리기가 없어 연결이 끊기면 한 건도 안 남는다 |
| 측정 구간에 상한을 걸지 않는다 | 느리다는 사실이 실패로 바뀌고 끝낸 건수도 사라진다 |
| 버리는 실행은 `.benchmark/warmup`으로 보낸다 | 콜드 스타트(Cold Start)가 표에 행으로 남는다 |
| 입력을 기기마다 다시 만들지 않는다 | 표본이 갈리고 `inputs_sha256`이 어긋나 `5`가 끝낸 기기까지 거절한다 |
| `download`의 로컬 폴더는 `$B`가 아니라 `$W` | `analysis/analysis/`로 풀린다 |
| `--files`에는 `$W/inputs/`의 파일을 준다 | 다른 기기에 올라가지 않고 커밋에서도 빠진다 |
| 추가 인자(Argument)는 두 `measure.py` 줄에 똑같이 붙인다 | 덥힌 조건과 기록한 조건이 달라진다 |
| `--serve`를 붙이지 않는다 | 안 쓰는 컴포넌트까지 떠서 `pnpm install`이 콜드 스타트에 섞이고, node 없는 기기는 못 돈다 |
| 모델(Model) 쪽 의존성은 손대지 않는다 | 컴포넌트 런타임(Runtime)이 `venv`와 `torch`를 스스로 깐다 |
| `$W/inputs/`와 `$B/inputs.jsonl`을 결과와 함께 커밋한다 | 채점이 쓰는 입력이 사라진다 → 저작권은 `references/benchmark-file.md`를 따른다 |
| `machines`의 모든 기기가 `accuracy/`를 가질 때까지 `$B/outputs/<기준 기기>`와 `-repeat`을 지우지 않는다 | 나중에 재는 기기가 댈 상대를 잃어 `5`가 "its timings stand on nothing"으로 거절한다 |

| 인자 | 규칙 |
| :---: | --- |
| `--build` | 올린 가중치(Weight)의 ID → 허브 체크포인트 그대로면 `checkpoint.id`, 양자화(Quantization)·변환 빌드(Build)면 그 빌드의 ID |
| `--precision` | compose 파일 값 → 없으면 `auto`에 `--condition transformers=<버전>`을 더한다, 라이브러리(Library) 버전이 정밀도를 정한다 |
| `--quantization` | `none`·`int8`·`int4`·`nf4`만 → AWQ·GPTQ 빌드는 담는 비트 수로 적는다 |
| `--quantization-backend` | `bitsandbytes`·`quanto`·`torchao`만 → 양자화가 `none`이면 금지, 아니면 필수 |
| `--quantization-skip-modules` | 전정밀도로 남은 모듈(Module) 이름을 빌드 설정에서 읽어 쉼표로 잇는다 → 비우면 행이 `scope unstated`로 남는다 |
| `--device <ID>=<장치>` | 다른 가속기가 박힌 컴포넌트에 붙인다 → compose 파일이 못 박았으면 기기를 연 직후 정한다 |
| `--seed <정수>` | `seed`를 받는 액션이 있으면 필수, 기기마다 같은 아무 정수 → 표본용 `dataset.seed`와 별개 |
| `--option <컴포넌트>.<설정>=<값>` | 그 기기라야 필요한 컴포넌트 설정 → 쓰기 전에 `references/measurement.md`를 읽는다 |
| `--item-limit <N>` | 데이터셋을 다 돌 시간이 없는 기기 → `N`은 `references/measurement.md`의 파일럿(Pilot)으로 정한다 |
| `--condition NAME=VALUE` | 위가 이름 붙이지 않은 설정 |

`--device`, `--option`, `--seed`는 메모리의 설정만 바꾸므로 `releases/<예제>/`는 배포된 그대로 남는다. 결과를 받아 오면 사람에게 커밋을 맡긴다.

| 결과가 없는 기기 | 할 일 |
| :---: | --- |
| PyTorch로 가중치를 못 올린다 | `references/measurement.md`의 판단을 먼저 거친다 → 다른 추론 스택(Stack)으로 바꿔 재지 않는다 |
| 가속기에 그 연산의 커널(Kernel)이 없다 | 같은 파일의 회피 표를 거친다 → 막힌 서브모듈(Submodule)만 CPU로 내리는 설정이 있으면 `--option`으로 주고 행을 세운다 |
| 데이터셋을 다 돌 시간이 없다 | 같은 파일의 파일럿으로 실측한 뒤 사람에게 예산을 묻는다 → 추정한 시간으로 `N`을 정하지 않는다 |
| 접속이 안 되거나 끝내 못 잰다 | 아래 사유를 `unmeasured/<기기>.json`에 남기고 결과와 함께 커밋한다 → 보고에만 적으면 README 쪽이 제외 이유를 확인할 길이 없다 |
| 나중에 쟀다 | `unmeasured/<기기>.json`을 지운다 |
| `measure.py`가 종료 코드 `3`을 내거나 결과 `errors`에 `other processes`가 있다 | 남의 프로세스를 중지하지 않는다 → 출력을 사람에게 보이고 비운 뒤 그 기기만 다시 잰다 |

```json
{ "machine": "<기기>", "reason": "<한 문장>", "evidence": "<run이나 러너 출력의 원문 발췌>" }
```

### 4. 판정

| `accuracy/<기기>.json`의 `verdict` | 할 일 |
| :---: | --- |
| `pass`, `baseline` | `5` |
| `fail`, 결과의 `conditions`가 의도와 다르다 | 정밀도·`--device`·`--seed`·`--option`의 누락이나 오타다 → 고치고 `3` |
| `fail`, `conditions`가 의도 그대로다 | 양자화·변환 빌드나 그 가속기의 정확도 하락이라는 결과다 → 설정을 바꿔 다시 재지 않고 수치와 출력을 사람에게 보이고 멈춘다 |
| `review` | 사람이 출력을 대조하고 `pass`나 `fail`로 고쳐 적는다 |
| `null` | `person_judged`라 비워 둔 자리다 → 사람의 답을 `verdict`에, 근거를 `verdict_note`에 적는다 |

### 5. 보고

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/validate_results.py" workspaces/<예제>/analysis/results \
  --benchmark workspaces/<예제>/analysis/benchmark.json --accuracy-directory workspaces/<예제>/analysis/accuracy
```

종료 코드(Exit Code)가 `1`이면 보고하지 않는다. `0`이면 단위 변환, 유효숫자, 배수 열, 링크도 더하지 않고 JSON을 한 글자도 고치지 않은 채 싣는다. 덧붙이는 것은 `unmeasured/`의 기기와 이유, 그리고 참조 파일이 보고에 적으라고 한 단서뿐이다.

`conditions`에 `item_limit`이 있는 행은 `item_count`를 반드시 함께 싣는다. 표본 수를 안 적으면 3건으로 잰 중앙값이 20건으로 잰 중앙값과 같은 무게로 읽힌다.

## 참조 파일

| 파일 | 읽을 때 |
| :---: | --- |
| `references/benchmark-file.md` | `2`에서 파일을 쓸 때 |
| `references/accuracy-method.md` | `checks` 답이 갈리는 경우, `machine_distance` 반복 실행, `fail`·`review`·`null` 해석 |
| `references/measurement.md` | 메모리 수치가 이상하거나, 가중치를 못 올리거나, 가속기에 커널이 없거나, 데이터셋을 다 돌 시간이 없는 경우 |

## 금지 사항

- 측정하지 않은 값을 보고하지 않는다
- `5`의 JSON을 받아 갈 스킬을 지목하지 않는다 → 부르는 쪽이 정한다
- 측정값이 없으면 빈 표나 표 골격을 만들지 않는다 → `benchmark.json`만 쓰고 멈춘다
- 채점 지표를 새로 구현하지 않는다 → `check_benchmark.py`가 모르는 지표라고 거절하면 사람에게 보고한다
- 출처는 결과 파일, 사람의 답, 공개된 모델 카드뿐이다
- `workspaces/<예제>/analysis/`와 `workspaces/<예제>/inputs/` 밖의 파일을 고치지 않는다

## 압박

| 합리화 | 반박 |
| --- | --- |
| 추정이라고 라벨을 달면 된다 | 인용되며 라벨은 떨어지고 숫자만 남는다 |
| 대역폭과 파라미터(Parameter) 수로 계산할 수 있다 | 엔진(Engine)과 커널(Kernel)이 바뀌면 몇 배씩 틀린다 |
| 공개 수치를 옮기면 된다 | 인용은 설정을 검증 못 한다 |
| 신뢰도 낮음이라 적었다 | 한 표에 있으면 측정으로 읽힌다 |
