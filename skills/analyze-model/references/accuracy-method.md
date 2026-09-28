## 질문별로 답하는 법

출처에서 직접 읽은 사실만 참이고, 출처가 침묵하면 거짓이다.

| 경우 | 답 |
| --- | --- |
| 이 체크포인트(Checkpoint)의 공개 점수가 아예 없다 | `published_score`, `reproducible_dataset`, `published_harness` 모두 `false` |
| `published_score`가 `false`라 뒤 질문이 방법에 영향이 없다 | 그래도 출처대로 답한다 |
| 체크포인트를 올리는 컴포넌트(Component)가 여럿이다 | `checkpoint`와 `--build`는 채점하는 출력을 내는 모델(Model), 나머지가 있으니 `published_score: false` |
| 음성 구간 검출(Voice Activity Detection, VAD)·자르기·합치기·번역처럼 입력이나 출력을 바꾸는 컴포넌트가 앞뒤에 있다 | `published_score: false` → 공개 점수는 다른 시스템의 점수다 |
| 입력을 그대로 넘기는 형식 변환만 있다 | 입력·출력을 바꾸는 컴포넌트로 치지 않는다 |
| 공개 점수가 같은 계열의 다른 크기나 양자화(Quantization)·변환 빌드(Build)의 점수다 | `published_score: false` |
| 체크포인트가 허브(Hub)가 아니라 pip 패키지(Package)에 번들된다 | 체크포인트로 본다, `checkpoint.id`에 `패키지==버전` |
| 공개 점수의 데이터셋(Dataset)이 비공개이거나 "무작위 N시간"처럼 분할을 재현할 수 없다 | `reproducible_dataset: false` |
| 공개 점수를 낸 정규화기가 하네스(Harness) 저장소 안에 있다 | `published_harness: false`, 같은 규칙의 패키지를 `normalizer`에 쓴다 |
| 하네스는 공개인데 점수를 낸 커밋(Commit)·정밀도(Precision)·GPU가 비공개다 | `published_harness: false` |
| 공개 점수가 병합 안 된 PR이나 검증 표시 없는 평가 결과에만 있다 | `published.verified: false`를 보고에도 적는다 |
| 공개 점수가 리더보드(Leaderboard)에만 있다 | `source_url`은 리더보드, 하네스를 공개한 리더보드면 `verified: true` |
| compose 파일이 체크포인트 리비전(Revision)을 고정하지 않는다 | 측정 기간이 길면 기기마다 최신을 받았음을 보고에 적는다 |

마지막 세 줄은 `checks` 답을 바꾸지 않고 보고에만 더한다.

`published_harness`가 거짓인 통과는 재현이 아니므로, 조건이 미공개라 같다고 주장할 수 없다고 보고에 적는다.

## `machine_distance` 반복 실행

기준 기기의 두 실행 사이 거리(자기 거리)를 바닥으로 두고, 다른 기기와의 거리(기기 간 거리)를 거기 댄다. 입력은 `20`건 이상이다.

| 항목 | 값 |
| :---: | --- |
| 기준 기기 | compose 파일이 정한 가속기 종류를 그대로 쓰는 기기, 여럿이면 빠른 쪽 → 반복 실행이 한 번 더 든다 |
| `--device`로 한 장 고정 | 종류를 바꾸지 않으므로 기준 자격을 잃지 않는다 |
| `metric` | 출력 형식의 거리 지표, `scale`은 `1` |

| 순서 | 기기 | 할 일 |
| :---: | :---: | --- |
| 1 | 기준 기기 | 러너(Runner)를 한 번 더, `--output-directory $B/outputs/<기준 기기>-repeat --results-directory .benchmark/repeat-results` |
| 2 | 기준 기기 | `score_outputs.py`에 `--repeat-outputs $B/outputs/<기준 기기>-repeat` → `baseline` |
| 3 | 나머지 | `--baseline-outputs $B/outputs/<기준 기기> --repeat-outputs $B/outputs/<기준 기기>-repeat` |

`$B`는 `workspaces/<예제>/analysis`다.

`review`는 자기 거리가 `0`인데 기기 간 거리가 생겼다는 뜻이고 실패가 아니다. 탐욕 디코딩(Greedy Decoding)도 저정밀도에서 커널(Kernel)이 다르면 토큰(Token) 하나가 뒤집혀 뒤가 전부 틀어진다. 두 출력의 내용이 다를 때만 `fail`로 고쳐 적는다.

시드(Seed)가 풀린 샘플링(Sampling) 모델은 자기 거리가 커서 `pass`가 아무것도 뜻하지 않는다. `--seed`로 고정하고, 수단이 없으면 `scorable: false`로 `person_judged`에 내린다.

`score_outputs.py`가 종료 코드(Exit Code) `2`로 표본율(Sample Rate)·채널·해상도·프레임 수 차이를 알리면 출력을 그대로 보고하고 멈춘다.

## `person_judged`

모델 카드의 데모 입력을 `workspaces/<예제>/inputs/`에 두고 `prepare.py --files`로 넣는다. 카드의 출력이 재현되는지는 사람이 판정하고, 통과해도 정확도 수치는 없다.

`score_outputs.py`는 `verdict`·`verdict_note`를 `null`로 비운 `accuracy/<기기>.json`을 쓰고 종료 코드 `1`을 낸다. 아직 아무도 안 봤다는 뜻이라 `3`으로 돌아가지 않는다.

## 하면 안 되는 것

| 하면 | 그 대신 |
| --- | --- |
| 공개 점수가 말하지 않은 조건을 채워 넣는다 | 해당 질문을 `false`로 답하고 끝낸다 |
| 정밀도가 다른 행을 하나의 정확도 열로 비교한다 | 정밀도가 맞는 행끼리만 비교한다 → 양자화·변환 행은 표를 따로 둔다 |
| 리포지터리(Repository) 루트(Root)의 `benchmarks/`로 정확도를 재려 한다 | 거기는 프레임워크(Framework) 오버헤드(Overhead) 비교용이라 정확도 코드가 없다 |
