---
name: build-ui
description: Use when building or changing a model-compose release's web UI (web/), or when the user says "UI 만들어", "웹 UI", "화면", "webui", "build the UI", "프런트엔드".
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, PowerShell, Skill
---

## 절차

산출물은 배포되는 `releases/<릴리스>/web/`과 배포되지 않는 `workspaces/<릴리스>/`의 캡처와 `web/test/`다. 골격은 스킬이 가진 셸(Shell)을 `scripts/scaffold.py`로 깔고, 릴리스는 셸이 비워 둔 자리만 채운다.

### 1. 입력

| 입력 | 어디서 |
| --- | --- |
| UI에 넣을 워크플로 | 사람의 답, 없으면 `model-compose.yml`의 워크플로 전부 |
| 입력 컨트롤과 실행 방식 | 같은 파일의 `action`과 `output` |
| 출력 모양 | 아래 캡처로 저장한 `workspaces/<릴리스>/captured-output.json`, 넣을 워크플로마다 한 번 |
| 캡처에 쓸 입력 | 사람의 답, 없으면 질문 |

`captured-output.json`이 없으면 `yaml-for-everything:run` 스킬로 릴리스를 열고 `up`으로 서버를 띄운 뒤 캡처한다. `up`이 실패하면 `yaml-for-everything:run`의 대응대로 보고 후 중단하고, `model-compose.yml`이 원인이어도 고치지 않는다. UI에 넣을 워크플로가 여럿이면 `captured-output.<workflow-id>.json`으로 나눠 저장한다 — yml에 워크플로가 더 있어도 UI에 하나만 넣으면 `captured-output.json` 하나다. 캡처는 `releases/<릴리스>/`에서 돌리고 `workspaces/<릴리스>/`에 저장한다. `<api-url>`은 `up`이 출력한 `adapter` 주소다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/capture_output.py" <api-url> <workflow-id> '<입력 JSON>' ../../workspaces/<릴리스>/captured-output.json --file <필드>=<경로>
```

| 입력 필드 | 넘기는 곳 |
| --- | --- |
| `as audio`, `as image`, `as video`, `as file` | `--file <필드>=<경로>`, 필드마다 한 번 — 스크립트(Script)가 소켓으로 업로드한다 |
| 그 밖 | `<입력 JSON>`, 없으면 `'{}'` |

스크립트는 서버가 연결을 받을 때까지 기다리므로 따로 폴링하지 않는다.

| `capture_output.py` 종료 코드 | 할 일 |
| :---: | --- |
| `0` | 그대로 사용 — 값이 입력과 어긋나 보여도 저장된 모양 그대로 만들고 `보고만 한 것`에 적는다. 아래 대조에서 어긋난 필드는 화면에 올리지 않는다. 빠진 항목은 채우지 않고 있는 항목만 그린다. 이중으로 감싼 키는 그 경로 그대로 읽는다 |
| `3` | 실행 실패, 출력 그대로 보고 후 중단 |
| `4` | 워크플로 출력 자체가 살아 있는 스트림(Stream)이거나 바이트가 아닌 스트림이다 — 셸이 배치만 그리므로 보고 후 중단 |
| `5` | 메시지 없이 오래 멈췄다 — 서버 로그를 확인해 보고 후 중단 |
| `6` | 서버가 연결을 받지 않았다 — 서버 로그 끝부분을 보고 후 중단 |
| 그 밖의 코드 | 출력 그대로 보고 후 중단 |

`0`이어도 출력을 입력 파일과 대조한다. 길이, 개수, 시각처럼 입력 파일에서 `ffprobe`나 `ffmpeg`로 직접 잴 수 있는 값(길이, 크기, 개수)과 비교하는 것은 모델 조사가 아니다. 출력이 잰 값과 어긋나면 그 필드를 틀린 줄 아는 필드로 본다.

어느 경우든 `yaml-for-everything:run`의 `close`로 닫고 끝낸다. `captured-output.json`의 키는 잡(Job)의 `id`이고, `id` 없는 단일 `job:`은 `__job__`이다. 값은 그 잡의 `output:` 매핑을 거친 모양이다.

모델이 만든 오디오·이미지·영상은 JSON에 바이트로 들어가지 않는다. 스크립트가 바이트를 `captured-output.<잡>.<필드>.<확장자>`로 옆에 저장하고 JSON에는 `__media__` 참조만 남긴다. 이 사이드카 파일은 지우지 않고 `workspaces/<릴리스>/`에 함께 커밋한다.

> **멈춤 — 저장된 실제 출력이 없으면 UI도 없다.** 모델 카드나 README에서 모양을 지어내지 않고, 모델(Model)을 조사하지도 않는다.

### 2. 사실 표

사실은 스크립트가 뽑는다. 출력된 표를 그대로 이후 단계의 근거로 쓰고, 이 표에 없는 요소는 화면에 올리지 않는다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/extract_facts.py" . --workflow <UI에 넣을 workflow-id>
```

`--workflow`는 넣을 워크플로마다 한 번 준다. 빼면 뺀 워크플로의 action 값이 선택지 후보에 섞인다.

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | 사용 |
| `3` | `UNSUPPORTED` 입력이 있다 — 셸 계약에 자리가 없으니 그 필드를 보고 후 중단 |
| 그 밖의 코드 | 출력 그대로 보고 후 중단 |

사람이 올린 입력 파일은 표에 없어도 사실이다 — 결과 카드가 재생, 미리보기, 파일에서 읽히는 길이와 파형으로 쓸 수 있다.

### 3. 화면 후보

사람이 이미 정하지 않았다면, 결과 카드에 무엇을 보여줄지 후보 세 개를 내고 **고를 때까지 멈춘다**. 사이드바, 입력창, 스레드는 셸이 정하므로 후보가 아니다.

| 후보마다 적는 것 | 내용 |
| --- | --- |
| 결과 카드 | `header`, 본문, `footer`에 각각 무엇 |
| 입력창 | `files`, `prompts`, `options`에 무엇 |
| 근거 | 사실 표의 어느 행, 또는 사람이 올린 입력 파일 |
| 사실 표 밖에서 오는 값 | 없으면 없음 |

사람이 결과 카드만 정했으면 입력창은 사실 표의 계약 필드 열에 `references/design.md`의 입력 규칙을 적용해 채운다 — 선택지 후보가 기본값 하나뿐인 `options` 필드는 칩 없이 기본값으로 보낸다. `prompts`가 둘 이상이면 어느 것을 본문 칸에 둘지도 후보에 적는다.

다른 막힌 결정으로는 멈추지 않는다. 막힌 것만 보고하고 나머지는 끝까지 만든다.

### 4. 뼈대

`references/scaffold.md`의 `깔기`대로 `scaffold.py`와 `add_webui.py`를 돌린다. 셸 파일, `index.css`, `client.ts`, 설정 파일이 `releases/<릴리스>/web/`에, 셸 테스트가 `workspaces/<릴리스>/web/test/`에 깔리고 `src/release/index.tsx`만 비어 있으며, `model-compose.yml`에 `webui` 컴포넌트가 붙고 `controller.webui`가 있으면 지워진다. 이 화면이 gradio 기본 화면을 대신한다.

### 5. 화면

`references/design.md`를 따라 `releases/<릴리스>/web/`의 `src/release/`, `src/domain/`과 `workspaces/<릴리스>/web/test/domain/`만 쓴다.

### 6. 검증

`references/verification.md`의 명령과 화면 확인, 마지막 점검을 전부 통과할 때까지 `5`와 오간다.

### 7. 보고

| 항목 | 내용 |
| :---: | --- |
| 화면 | 고른 후보와 사실 표의 어느 행에서 나왔는지 |
| 검증 | 돌린 명령과 결과, 찍은 화면 |
| 포트 | `add_webui.py`가 `id: webui` 컴포넌트에 고른 포트와 제외한 포트 |
| 보고만 한 것 | `model-compose.yml`이나 `src/`에서 눈에 띈 문제 |
| 미검증 | 실서버로 확인하지 못한 경로 |

## 고정과 자유

| 고정 — 셸 | 자유 — 릴리스 |
| --- | --- |
| 사이드바 기록, 빈 화면 배치, 입력창 틀, 스레드, 진행·실패·취소 카드 | 이름, `eyebrow`, `headline`, 캡션 문구 |
| 토큰, `ui/` 부품, 오디오 플레이어 | 결과 카드의 `header`, 본문, `footer` |
| `client.ts`의 프로토콜(Protocol), 멈추기의 `cancel` | 워크플로 선택지와 단계 이름 |
| 첨부 슬롯·입력 칸·옵션 칩의 모양 | 어떤 슬롯과 칩을 둘지, 선택지 |
| `package.json`의 의존과 버전 | `domain/`의 함수와 테스트 |
| 지원 언어 `en`·`ko`·`zh`, 언어 고르는 순서(`?lang=` → 사이드바 선택 → 브라우저 언어 → `en`), 언어별 문체 | 세 언어의 문구 내용, 실패 규칙 |

## 참조 파일

| 파일 | 읽을 때 |
| --- | --- |
| `references/scaffold.md` | `4`의 뼈대를 세울 때, 띄우는 설정을 붙일 때 |
| `references/design.md` | `2`의 사실 표를 쓸 때, `5`에서 무엇을 화면에 올릴지 정할 때 |
| `references/verification.md` | `6`에서, 그리고 빌드(Build)나 테스트가 실패했을 때 |

## 금지 사항

- 셸 파일을 고치지 않는다 → `scripts/verify.py`가 `assets/`와 대조해 잡는다, 셸이 모자라면 보고하고 멈춘다
- 스케일 밖의 색·크기·간격·둥글기를 쓰지 않는다
- 브라우저 기본 미디어 컨트롤을 쓰지 않는다 → `ui/audio/`의 플레이어
- 출력 모양 두 가지를 다 받는 폴백을 넣지 않는다 → 어긋나면 보고하고 멈춘다
- `model-compose.yml`은 `add_webui.py`가 하는 편집 말고는 고치지 않는다
- 저장된 출력에 없는 값을 화면에 올리지 않는다
- 릴리스 문구를 `Localized` 밖에 한 언어로만 쓰지 않는다 → `scripts/verify.py`가 잡는다
- 모델 출력 텍스트를 번역하지 않는다
- 파일에 주석(Comment)을 남기지 않는다
- 생성된 `web/`을 손으로 기우지 않는다 → 이 스킬(Skill)을 고치고 통째로 다시 만든다
- 테스트와 캡처를 `releases/<릴리스>/`에 두지 않는다 → `workspaces/<릴리스>/`에 둔다, `scripts/verify.py`가 잡는다

## 압박

| 합리화 | 반박 |
| --- | --- |
| 브랜드 색을 넣어야 한다 | 색은 모델이 내놓는 것에서만 온다. 토큰은 일부러 무채색이다 |
| 스케일이 충돌하니 토큰을 리스케일하자 | 릴리스(Release)를 안 고치고 스킬을 고치는 것도 토큰 변경이다 |
| 이 출력에는 셸 배치가 안 맞으니 `features/`를 조금 고치자 | 셸 한 곳을 고친 릴리스는 다음 `scaffold.py`에 덮이거나 `verify.py`에 걸린다. 모자란 자리는 계약을 늘릴 일이라 보고한다 |
| 대비가 오히려 좋아진다 | 더 나은 값이어도 릴리스끼리 다른 화면이 되는 값이다 |
| 미팅이 내일이다 | 다시 만드는 비용은 내일 이후에도 그대로 남는다 |
| 실제 출력 없이 먼저 만들고 나중에 맞추자 | 틀린 모양에 맞춰 만든 화면은 고치는 게 아니라 다시 만드는 것이다 |
| 두 모양 다 받게 해두면 안전하다 | 둘 중 틀린 쪽이 그대로 출하되고 아무도 확인하지 않는다 |
