---
name: compose
description: Use when starting a model-compose release or writing its model-compose.yml, or when the user says "서비스 만들어", "model-compose.yml 써", "compose it".
allowed-tools: Read, Glob, Grep, Write, Edit, WebSearch, WebFetch, Skill, Bash(PYTHONUTF8=1 model-compose *), PowerShell(Push-Location releases/*), PowerShell(Pop-Location), PowerShell($env:PYTHONUTF8=1), PowerShell(model-compose *), Bash(python -B *), PowerShell(python -B *)
---

## 절차

서비스를 `releases/<name>/model-compose.yml`로 작성한다.

> 그 밖의 파일은 만들지 않는다.

### 1. 설계

리포지터리(Repository)와 모델(Model) 카드·논문 같은 웹 자료를 조회해 워크플로(Workflow)와 서비스 두 표를 작성한다. 모르겠으면 빈칸으로 둔다.

#### 워크플로

```
| # | `id` | `type` | `task` | `driver` | `model` | `action` | 출처 |
| :---: | :---: | :---: | :---: | :---: | :---: | --- | --- |
```

| 열 | 채우는 법 |
| :---: | --- |
| `#` | `1`부터 붙이는 번호 |
| `id` | 컴포넌트(Component)가 하는 일을 나타내는 명사(e.g., `composer`, `transcriber`), 모델이나 계열 이름 금지, 같은 컴포넌트의 다른 액션(Action)을 쓰는 단계는 같은 `id` |
| `type` | `src/mindor/dsl/schema/component/impl/types.py`의 `ComponentType` 값 |
| `task` | `model` 컴포넌트만, `src/mindor/dsl/schema/component/impl/model/tasks/common.py`의 `ModelTaskType` 값 |
| `driver` | `model` 컴포넌트만, `architecture`·`family` 열거값이나 전용 로더(Loader)로 체크포인트(Checkpoint)를 배선한 드라이버(Driver) → 자동 감지 드라이버 → 빈칸 |
| `model` | `model` 컴포넌트만, 체크포인트 후보 ID와 GGUF면 파일명 |
| `action` | `model` 컴포넌트만, 스키마(Schema) 기본값과 다르게 고정할 `action` 필드(Field)와 `params`를 `이름: 값`으로 |
| 출처 | 파일 경로나 URL |

#### 서비스

```
| 워크플로 | `title` | `description` | 입력 | 출력 | 주 모델 | `실행`에 쓸 입력 | 라이선스 |
| :---: | --- | --- | :---: | :---: | :---: | --- | --- |
```

| 열 | 채우는 법 |
| :---: | --- |
| 워크플로 | 각 `id`와 단계별 `#` |
| `title` | 워크플로가 하는 일, 30자 이하 |
| `description` | 입력과 출력까지 한 문장, 120자 이하 |
| 입력 | `${input.<이름>}`의 `<이름>` |
| 출력 | 워크플로 `output`의 키와 값 |
| 주 모델 | `이름`에 넘길 단계 번호 |
| `실행`에 쓸 입력 | `입력` 열의 이름마다 사람이 준 값, 파일이면 경로, 주지 않은 입력은 예제에서 가져오지 않고 빈칸 |
| 라이선스(License) | 체크포인트마다 |

### 2. 승인

`설계` 결과에 관해 질문 후 승인이 올 때까지 멈춘다.

| 상황 | 표에서 질문할 칸 |
| :---: | :---: |
| 빈칸 | 그 칸 |
| 체크포인트 후보가 둘 이상 | `model` |
| 리포지터리가 모르는 체크포인트 | `model` |
| `task`와 드라이버 배선 불일치 | `task` |
| 예제 후보가 둘 이상이고 `output` 모양이 불일치 | 출력 |
| 경로에 없는 입력 파일 | `실행`에 쓸 입력 |
| `참고 예제`의 `action` 필드나 `params`와 스키마 기본값 불일치 | `action` |

### 3. 이름

`승인` 결과의 `task`·드라이버·체크포인트로 명령을 돌려 `<name>`을 얻는다. `<repository>`는 `src/`와 `releases/`가 있는 리포지터리 루트(Root) 경로다. `model` 컴포넌트의 `model`이 매핑(Mapping)이면 매핑의 `repository` 필드 값이 `<checkpoint-id>`다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/name.py" <repository> <task> <driver> <checkpoint-id>
```

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | 출력된 이름 그대로 사용 |
| `3` | 출력을 보여주고 변종 토큰(Token) 혹은 기존 릴리스(Release) 수정 여부 질문 |
| `4` | 주 모델 체크포인트 질문 |
| 그 밖의 코드 | 출력 그대로 보고 후 중단 |

### 4. 작성

#### 참고 예제

컴포넌트마다 `examples/`에서 비슷한 `model-compose.yml`을 두세 개 읽는다. `type`·`task`·`driver`가 같은 예제가 먼저다. 스키마 기본값은 `src/mindor/dsl/schema/`에서 그 필드의 `Field(default=...)`, `default_factory=...`, `mode="before"`가 채우는 값이다.

#### 작성 대상별 출처

| 작성 대상 | `설계` | `설계`에 없으면 `참고 예제` | `참고 예제`에 없거나 값이 서로 다르면 |
| :---: | :---: | :---: | --- |
| `controller.adapter` | | ✓ | 생략 |
| `controller.adapter.port` | | | `${env.PORT \| 8080}`, `참고 예제`에 리터럴(Literal)이 있어도 이 값 |
| `controller.webui` | | | `driver: gradio`, `port: ${env.SERVER_PORT \| 8081}` |
| `components` | ✓ | | |
| `model`이 아닌 컴포넌트 | | ✓ | 생략, 필드는 `docs/reference/compose/components/<type>.md`, 없으면 `src/mindor/dsl/schema/component/impl/<type>.py` |
| `model` 컴포넌트의 `task`·`driver`·`model` | ✓ | | GGUF면 `model`은 `provider: huggingface`·`repository`·`filename` 매핑 |
| `architecture`·`family`·`preset` | | ✓ | 체크포인트가 요구하지 않으면 생략 |
| `runtime.type` | | | `virtualenv` |
| `runtime.path` | | | `.venv/<컴포넌트 id>` |
| `runtime.start_timeout` | | | `참고 예제`에 있어도 생략 |
| `device`·포트(Port)·모델 경로처럼 기기마다 다른 값 | | ✓ | `${env.<NAME> \| <값>}`, `<값>`은 `type`·`task`·`driver`가 같은 `참고 예제`의 값 |
| 그 밖의 컴포넌트 필드 | | ✓ | 생략 |
| `workflows` | ✓ | | 단계 사이 값은 `${jobs.<id>.output}` |
| 워크플로 `title`·`description` | ✓ | | |
| `action` 필드와 `params` | ✓ | | 생략 |

#### 규칙

| 상황 | 작성 |
| --- | --- |
| `components`·`workflows` | 목록 |
| 워크플로 `id` | 동작 이름(e.g., `speak`, `transcribe`) |
| 워크플로 `output` | 값이 하나여도 이름 붙인 매핑(e.g., `audio: ${output as audio/wav}`) |
| 단계가 하나 | `job` |
| 단계가 둘 이상 | `jobs` |
| 체크한 열에서 값을 못 찾고 마지막 열도 빈칸 | 질문 |
| `설계` 결과에 없는 단계나 출처 없는 값이 필요 | 질문 |
| 앞 단계의 출력을 쓰는 단계 | `depends_on`에 그 잡(Job)의 `id` |
| 서로의 출력을 쓰지 않는 단계 | `depends_on`을 걸지 않아 병렬로 실행 |
| 한 스트림(Stream)을 둘 이상의 단계가 사용 | `fan-out` 잡의 `output`에 사용할 단계마다 이름을 선언하고 `${jobs.<id>.output.<이름>}` |
| 목록의 항목마다 같은 처리 | `for-each`, `batch_size`는 `max_concurrent_count`로 동시 실행을 제한하는 경우 그 수 이하 |
| 항목 결과를 끝나는 대로 다음 단계로 | `for-each`의 `streaming: true` |
| 모델 출력이 도착하는 대로 사용 | 액션 `streaming: true`, 워크플로 `output`의 값은 `${output as stream/<타입>}` |

### 5. 검증

```bash
(cd releases/<name> && PYTHONUTF8=1 model-compose -f model-compose.yml validate)
```

```powershell
Push-Location releases/<name>; if ($?) { $env:PYTHONUTF8=1; model-compose -f model-compose.yml validate; Pop-Location }
```

가상 환경(Virtual Environment)이 작업 디렉터리(Working Directory) 기준이고 그 디렉터리는 다음 호출까지 남으므로, 괄호·`Pop-Location`·UTF-8 강제·`-f` 위치를 바꾸지 않는다.

| `0`이 아닌 종료 코드가 가리키는 것 | 할 일 |
| :---: | --- |
| 사람이 고른 값 | 한 글자도 고치지 않고 출력 그대로 보고 후 중단 |
| 그 밖의 스키마 위반 | 수정 후 재실행 |
| `model-compose` 기동 실패 | 출력 그대로 보고 후 중단 |

### 6. 실행

`yaml-for-everything:run` 스킬(Skill)로 `releases/<name>`을 기기 `local`에서 열고, `설계`의 `실행`에 쓸 입력으로 워크플로를 한 번 돌린 뒤 닫는다.

| `yaml-for-everything:run` 결과 | 할 일 |
| :---: | --- |
| `output.json`의 키와 모양이 `승인` 결과와 일치 | 요약 보고 후 종료 |
| 불일치 | 고치지 않고 출력 그대로 보고 후 중단 |
| 실패 | `yaml-for-everything:run`의 대응대로 보고 후 중단 |
