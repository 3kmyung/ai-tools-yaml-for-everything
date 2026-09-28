---
name: release
description: Use when taking a model all the way to a finished model-compose release, or when the user says "배포 버전", "처음부터 끝까지", "release it".
allowed-tools: Glob, Skill, AskUserQuestion, Bash(python -B *), PowerShell(python -B *), Bash(mkdir -p workspaces/*), Bash(mv releases/* workspaces/*), Bash(git mv releases/* workspaces/*), PowerShell(New-Item -ItemType Directory -Force workspaces/*), PowerShell(Move-Item releases/* workspaces/*), PowerShell(git mv releases/* workspaces/*)
---

## 절차

이 스킬(Skill)은 두 폴더가 다 찰 때까지 순서와 완료 여부만 정한다. 명령은 모두 리포지터리(Repository) 루트(Root)에서 실행한다.

| 폴더 | 역할 | 담는 것 |
| :---: | --- | --- |
| `releases/<예제>/` | `github.com/MindrLabs/<예제>`로 나갈 배포본 | 모든 README |
| | | `model-compose.yml` |
| | | README가 싣는 `docs/images/` |
| | | `LICENSE` |
| | | 웹 UI를 만든 경우 `test/` 제외한 `web/` |
| `workspaces/<예제>/` | 그 배포본을 만든 과정의 산출물 | 그 밖의 전부 |

### 1. 호출

아래 순서대로 호출하고 스킬에는 `<예제>`를 넘긴다. `완료 판정`의 파일이 이미 있거나 사람이 안 만들기로 한 호출은 건너뛰고 끝난 것으로 센다. `완료 판정`이 빈 호출은 매번 돈다.

| # | 호출 | 완료 판정 | 먼저 끝나야 하는 호출 |
| :---: | --- | --- | :---: |
| 1 | `yaml-for-everything:compose` | `releases/<예제>/model-compose.yml` | |
| 2 | 웹 UI를 만들지 Gradio로 둘지 `AskUserQuestion` | `releases/<예제>/web/` | 1 |
| 3 | `yaml-for-everything:build-ui`, `2`에서 만든다고 한 경우만 | `releases/<예제>/web/` | 2 |
| 4 | `yaml-for-everything:analyze-model` | | 1 |
| 5 | `yaml-for-everything:write-readme` | `releases/<예제>/README.md`, `releases/<예제>/LICENSE` | 3, 4 |
| 6 | `yaml-for-everything:write-post` | `workspaces/<예제>/comparison.md`나 `workspaces/<예제>/local.md` | 5 |

| 호출의 결과 | 할 일 |
| :---: | --- |
| 완료 | 다음 호출로 진행 |
| 사람에게 질문 | 그대로 사람에게 전달 후 답 대기 |
| 중단 보고 | 그대로 전달 후 중단 |

### 2. 점검

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/check.py" releases/<예제>
```

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | `보고`로 진행 |
| `1`, `unshippable <경로>` | 상위 폴더 생성 → `git mv releases/<예제>/<경로> workspaces/<예제>/<경로>` |
| `git mv`가 `not under version control`로 실패 | 같은 이동을 `mv`(PowerShell은 `Move-Item`)로 재시도 |
| `1`, `missing <경로>` | 그 파일을 만드는 `호출`로 복귀(e.g., `README.md`·`LICENSE`·`docs/images/` → `yaml-for-everything:write-readme`) |
| 그 밖 | 출력 그대로 보고 후 중단 |

> `1`은 `unshippable`과 `missing`을 한 번에 내므로 출력된 줄을 전부 처리한 뒤 재실행한다.

### 3. 보고

| 항목 | 내용 |
| :---: | --- |
| 호출 | 호출마다 완료, 건너뛰기, 중단 중 하나 |
| 배포본 | `releases/<예제>/`의 파일 목록 |
| 옮긴 파일 | `점검`에서 `workspaces/<예제>/`로 옮긴 경로 |
| 사람이 할 일 | 커밋(Commit), `releases/<예제>/`를 `github.com/MindrLabs/<예제>`로 푸시(Push) |

## 금지 사항

- 호출한 스킬의 일을 직접 하지 않는다
- 호출한 스킬의 질문에 대신 답하지 않는다
- 중단된 호출을 건너뛰고 다음 호출로 가지 않는다
- 커밋하거나 푸시하지 않는다
