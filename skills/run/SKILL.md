---
name: run
description: Use when running a model-compose service for development on this PC or an SSH machine, serving its API or web UI for a check or a capture, or when the user says "서비스 띄워", "run it remotely", "model-compose 실행".
allowed-tools: Read, AskUserQuestion, Bash(python -B *), PowerShell(python -B *)
---

## 절차

서비스를 이 리포지터리(Repository) 코드와 함께 기기의 임시 폴더 아래 작업 폴더에 설치해 돌린다. 명령은 모두 리포지터리 안에서 실행한다.

### 1. 기기

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" machines
```

| 상황 | 할 일 |
| :---: | --- |
| 호출한 스킬(Skill)이나 사용자가 기기 지정 | `열기`로 진행 |
| 미지정 | 매번 `machines`를 새로 실행, 이전 결과 재사용 금지 |
| 사용자가 원격이라고 한 경우 | `local`을 선택지에서 제외 |
| 선택지 네 개 초과 | 한 호출 안에서 질문을 분리 |

| `machines`의 `state` | 질문 처리 |
| :---: | --- |
| `ready` | 다중 선택 선택지, `free`·`detail`을 설명에 포함 |
| `unreachable`, `unusable` | 선택지에서 빼고 질문 본문에 이름과 `detail` 그대로 |

### 2. 열기

고른 기기를 한 번에 열어 세션(Session) 하나로 묶는다. `<서비스>`가 주어지지 않았으면 묻고 중단한다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" open <서비스> --machine <기기> [--machine <기기>...] [--ref <ref>] [--package <패키지>...]
```

| `<서비스>` | 보내는 것 |
| :---: | --- |
| 서비스 폴더 경로 | 그 폴더의 작업 트리(Working Tree) 그대로 |
| `releases/<이름>/model-compose.yml`이 있는 이름 | 그 폴더의 작업 트리 그대로 |
| 그 밖의 이름 | `releases/<이름>` 브랜치(Branch)의 마지막 커밋(Commit), 로컬에 없으면 `origin` |

| 옵션 | 뜻 |
| :---: | --- |
| `--ref` | 기본 `main`, 이 `<ref>`에 커밋된 코드만 전송, 수정이 다른 브랜치에만 있으면 지정 |

| 출력 | 할 일 |
| :---: | --- |
| 기기마다 `ready <기기>` | 그 기기를 이후 명령에 사용 |
| `run.py: error:`로 시작하고 `set up on`이 없는 줄 | 출력 그대로 보고하고 그 기기 제외 |
| `set up on <기기> exited with code` | 출력 그대로 보고하고 그 기기를 `close --machine <기기>` |
| 마지막 줄 `session <서비스>/<시각>` | 이후 명령의 `--session` 값 |
| 마지막 줄이 `session`이 아닌 경우 | 연 기기가 없으므로 출력 그대로 보고 후 중단 |

| 표기 | 뜻 |
| :---: | --- |
| `<대상>` | 이후 명령의 `[--session <서비스>/<시각>] [--machine <기기>]` |
| `--session` | 열린 세션이 하나면 생략 |
| `--machine` | 세션에 기기가 하나면 생략 |

### 3. 띄우기

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" up <대상> [--webui gradio|component]
```

| `--webui` | 실행 범위 |
| :---: | --- |
| 생략 | API만 |
| `gradio` | API와 Gradio 기본 UI |
| `component` | API와 서비스의 `webui` 컴포넌트(Component), `node`·`pnpm` 필요 |

- `--webui`를 주면 그 UI 포트(Port)가 열릴 때까지 대기
- 원격 기기는 로컬 터널(Tunnel)로 연결, 로컬 포트는 `model-compose.yml`의 포트와 별개
- `model-compose.yml`의 포트를 남의 프로세스가 쓰고 있으면 작업 폴더 사본의 그 포트를 다음 빈 포트로 옮겨 띄운다 → 출력의 `moved the ... port` 줄을 보고에 포함
- 이 세션 서버(Server)가 같은 구성으로 실행 중이면 터널만 재연결 → 출력된 주소가 응답하지 않으면 `up` 재실행

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | `model-compose.yml`의 포트가 아닌 출력된 `http://127.0.0.1:<포트>` 주소 사용 |
| `8`, `this session's server is already running with other interfaces` | `down` 후 원하는 `--webui`로 `up` |
| `8`, `--webui component cannot move ports` | 남의 프로세스(Process)는 중지하지 않고 출력 그대로 보고 후 중단 |
| 그 밖의 종료 코드 | 출력 그대로 보고 후 중단 |

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" down <대상>
```

> `down`은 서버와 터널만 중지하고 세션과 작업 폴더는 남긴다.

### 4. 호출

워크플로(Workflow)를 한 번 돌려 결과물을 로컬로 가져온다.

| `${input.<이름> as <타입>}` | 넘기는 곳 |
| :---: | --- |
| `audio`, `image`, `video`, `file` | `--file <이름>=<경로>`, 입력마다 한 번 |
| 그 밖, `as` 없음 포함 | `<입력 JSON>`, 없으면 `'{}'` |

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" call <대상> <워크플로 ID> '<입력 JSON>' [--file <이름>=<경로>...] [--output-directory <폴더>]
```

```powershell
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" --% call <대상> <워크플로 ID> "{\"<이름>\":\"<값>\"}" [--file <이름>=<경로>...] [--output-directory <폴더>]
```

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | 마지막 줄의 `saved <폴더>` 안 `output.json` 사용 |
| `6` | `up`을 먼저 실행 |
| 그 밖의 종료 코드 | 출력 그대로 보고 |

> 서버 없이 명령을 돌리거나 파일을 주고받으면 `references/commands.md`를 읽는다.

### 5. 닫기

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" close <대상>
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" list
```

| 상황 | 할 일 |
| :---: | --- |
| 작업 종료, 실패 포함 | 연 기기마다 `close <대상>`으로 서버, 터널, 백그라운드(Background) 작업을 중지하고 작업 폴더 삭제 |
| 사용자가 띄워 두라고 한 경우 | 닫지 않고 세션, 기기, 주소 보고 |
| 남은 세션 확인 | `list` |
| `call` 결과물 | `close` 뒤에도 남으므로 그대로 사용 |
| `close` 종료 코드(Exit Code) `9` | 서버, 백그라운드 작업 중지나 삭제 실패로 작업 폴더가 남은 것, 출력 그대로 보고 |
| `close`의 그 밖의 종료 코드 | 출력 그대로 보고 |

## 실패 대응

> 실패하거나 결과가 이상하면 보고 전에 `references/failures.md`에서 증상을 찾아 대응한다.

## 금지 사항

- 호스트(Host) Python, 전역 pip, 홈 폴더에 설치하지 않는다 → 작업 폴더 안에만 설치
- 서비스 원본을 고치지 않는다 → 실행에 필요한 변경은 `up`이 사본에 적용
- 남의 프로세스를 중지하지 않는다
