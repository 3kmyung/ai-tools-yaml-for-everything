---
name: write-post
description: Use when a release's README is finished and needs an X thread, or when the user says "X 포스트", "트윗", "스레드", "SNS 홍보".
allowed-tools: Read, Glob, Grep, Write, Edit, WebSearch, AskUserQuestion, Bash(python -B *), PowerShell(python -B *), Bash(python -m pip install *), PowerShell(python -m pip install *)
---

## 절차

### 1. 조회

| `releases/<example>/` 상태 | 행동 |
| :---: | --- |
| `README.md` | `작성`으로 진행 |
| `README.md` 없을 때 | 중단 → `write-readme` 스킬(Skill) 호출 |

| 값 | 출처 |
| :---: | --- |
| `README.md`에 있는 값(e.g., 수치, 조건, 기계, 단위) | `README.md`만, 웹 검색 결과로 덮어쓰기 금지 |
| 첨부할 결과물 파일 | 사용자가 준 경로만 사용 → 없으면 `AskUserQuestion`으로 요청 |
| 그 밖에 `README.md`에 없는 모든 값(e.g., GitHub나 Hugging Face의 ID, 스타(Star)·포크(Fork) 수) | 웹 검색 |

> 스타·포크 수처럼 매일 변하는 값은 반올림한다(e.g., `83k`).

### 2. 작성

`유형`으로 정한 유형의 `${CLAUDE_SKILL_DIR}/references/<type>.md`를 읽고 그 파일의 `스레드`와 `예시`대로 쓴다. X 전용, 영어, 각 포스트는 X의 가중 280자 제한 안이다.

### 3. 분량 검사

포스트를 하나씩 UTF-8 파일로 저장하고 순서대로 넘겨 아래를 실행한다. `.md`·`.py`·`.sh`가 실제 국가 도메인(Domain)이라 X가 파일명도 링크로 걸어 23자로 세므로, 눈으로 센 길이와 어긋나는 것은 결함이 아니다.

```bash
python -B -c "import regex" || python -m pip install regex
python -B "${CLAUDE_SKILL_DIR}/scripts/check_x_post.py" <post-1.txt> <post-2.txt> ...
```

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | `산출`로 진행 |
| `1` | 초과분만큼 줄여 재실행 |
| `2` | 잘못된 호출 → 인자(Argument)와 파일 경로를 고쳐 재실행 |

> 거부되면 넘기지 않는다.

### 4. 산출

고른 유형 파일의 `스레드`에 적힌 경로와 틀대로 쓴다.

## 유형

| 요청 | 행동 |
| :---: | --- |
| 유형 지정 | 그 유형으로 `작성` 진행 |
| 유형 미지정 | `${CLAUDE_SKILL_DIR}/references/`의 파일명을 선택지로, 각 파일 `스레드`의 첫 문장을 설명으로 `AskUserQuestion` 선택 요청 |

## 규칙

- 문장 안의 세미콜론(Semicolon)과 엠 대시(Em Dash) 금지 → 마침표나 쉼표, 합성어의 하이픈(Hyphen)은 허용
- AI 티 제거, 행위자 없는 수동과 `not just X, it's Y` 대구까지
- 수치·이름 날조 금지
- X는 마크다운(Markdown)을 그리지 않으므로 포스트 본문에 백틱(Backtick)과 마크다운 문법 금지 → 입력 문자열은 큰따옴표
- 고쳐 쓴 문장은 `작성`과 `규칙`에 따라 재점검
