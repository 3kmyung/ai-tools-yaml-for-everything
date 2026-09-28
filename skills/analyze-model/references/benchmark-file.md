## `benchmark.json` 틀

```json
{
  "workflow": "__default__",
  "workflow_input": { "audio": "@input", "language": "en" },
  "output_field": "text",
  "output_kind": "text",
  "tokenizer": "<체크포인트 ID>",
  "checkpoint": { "id": "<체크포인트 ID>", "revision": "<커밋>" },
  "machines": ["<기기>", "<기기>"],
  "accuracy": {
    "checks": { "scorable": true, "published_score": true, "reproducible_dataset": true, "published_harness": false },
    "method": "published_score"
  },
  "dataset": { "source": "huggingface", "name": "<id>", "config": "clean", "split": "test", "input_column": "audio", "reference_column": "text", "sample_count": 300, "seed": 0 },
  "metric": { "name": "wer", "scale": 100, "requirements": ["evaluate==0.4.6", "jiwer==4.0.0"], "normalizer": "<모듈>:<이름>" },
  "published": { "score": 2.1, "decimals": 1, "source_url": "<URL>", "verified": false }
}
```

| 필드 | 넣는 값 |
| :---: | --- |
| `workflow` | 워크플로(Workflow) ID, 하나면 `__default__` |
| `workflow_input` | 필수 입력 전부, 데이터셋(Dataset) 항목 자리에 `"@input"` |
| `output_field` | 채점할 텍스트나 미디어의 점 경로, 청크(Chunk)·원소마다 모으면 `*.text`, 출력이 곧 그것이면 `null` |
| `output_kind` | `output_field`가 가리키는 것의 형식, `text`·`audio`·`image`·`video` 중 하나 |
| `tokenizer` | 텍스트 출력의 토크나이저(Tokenizer), 아니면 `null` |
| `machines` | `3`에서 연 기기 이름 → `2`에서는 키를 넣지 않는다 |
| `metric` | 아래 `metric` 표의 지표, 여러 값을 내는 지표면 `key`, 공개 단위로 맞출 `scale`, `person_judged`만 `null` |
| `published` | `published_score`가 아니면 `null`, `decimals`는 자릿수 |

## `metric`

지표는 `accuracy.method`가 정하고, 채점 도구는 지표 이름이 정하므로 지표도 도구도 따로 고르지 않는다.

| `accuracy.method` | `metric.name` |
| :---: | --- |
| `published_score` | 공개 점수가 쓴 지표 그대로, `output_kind`는 `text`만 |
| `machine_distance` | `output_kind`가 정한다 → `text`는 `cer`, `audio`는 `multi_resolution_stft`, `image`·`video`는 `structural_dissimilarity` |
| `person_judged` | `null` |

`requirements`에는 그 지표가 쓰는 패키지(Package)를 작성 시점 PyPI 최신 버전으로 `이름==버전`처럼 고정한다. 빠진 패키지는 `check_benchmark.py`가 알려 준다. 공개 점수의 지표를 `check_benchmark.py`가 받지 않으면 새로 구현하지 않고 사람에게 보고한다.

## `dataset`

공개 점수와 대조하려면 `source`가 `huggingface`여야 한다. 손으로 고른 파일로는 공개 점수를 주장할 수 없다. `files`는 공개 데이터셋이 없거나 못 쓸 때만 쓴다.

| `source` | 필수 필드 | `sample_count` |
| :---: | --- | --- |
| `huggingface` | `name`, `split`, `seed`, 그리고 `published_score`면 `input_column`·`reference_column` | `published_score`는 `300` 이하, `machine_distance`는 `20` 이상 |
| `files` | `path`, 늘 `inputs` | `workspaces/<예제>/inputs/`의 파일 수, `machine_distance`는 `20` 이상 → `--files`는 준 파일을 전부 쓴다 |

- `path`는 루트(Root)가 아닌 `workspaces/<예제>/` 기준이다 → 입력은 배포 리포지터리(Repository)에 들어가지 않고 README도 경로를 쓰지 않는다
- `person_judged`는 모델(Model) 카드의 데모 입력이라 `sample_count`가 `1`이어도 된다
- 저작권이 걸린 입력은 공개 리포지터리에 커밋(Commit)하지 않는다 → 출력도 함께 커밋된다

## 모르는 값

`output_field`는 추측하지 않고 `null`로 두며, 한 기기에서 `3`을 `--sample-count 2`, 두 폴더 인자(Argument) `.benchmark/smoke`로 먼저 돌려 `outputs.jsonl`을 본다. 이 스모크(Smoke) 실행이 첫 건을 쓴 뒤 `output_field ... selects no ...`로 내는 종료 코드(Exit Code) `1`은 설계된 동작이다.
