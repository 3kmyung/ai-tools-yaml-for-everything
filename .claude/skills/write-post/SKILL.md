---
name: write-post
description: Use when a release's README is finished and needs an X thread, or when the user says "X 포스트", "트윗", "스레드", "SNS 홍보", "posts.md".
allowed-tools: Read, Glob, Grep, Write, Edit, WebSearch, Bash(python -B *), PowerShell(python -B *), Bash(python -m pip install *), PowerShell(python -m pip install *)
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
| `README.md`에 없는 모든 값(e.g., GitHub나 Hugging Face의 ID, 스타(Star)·포크(Fork) 수) | 웹 검색 |

> 스타·포크 수처럼 매일 변하는 값은 반올림한다(e.g., `83k`).

### 2. 작성

반드시 `${CLAUDE_SKILL_DIR}/references/examples.md`를 읽는다. 포스트 다섯 개, X 전용, 영어, 각 포스트는 X의 가중 280자 제한 안이다.

| 포스트 | 내용 |
| :---: | --- |
| 1 | 결과, 로컬(Local)에서 돌았다는 장점, 모델(Model) 소개 |
| 2 | 이것으로 무엇을 할 수 있는지, 독자가 체감하는 장점 |
| 3 | `write-readme`가 찍은 결과물 GIF |
| 4 | 기계별 숫자 행과 그 행들의 조건, 기계당 한 행 |
| 5 | `model-compose` 링크 |

### 3. 분량 검사

포스트를 하나씩 UTF-8 파일로 저장하고 순서대로 넘겨 아래를 실행한다. `.md`·`.py`·`.sh`가 실제 국가 도메인(Domain)이라 X가 파일명도 링크로 걸어 23자로 세므로, 눈으로 센 길이와 어긋나는 것은 결함이 아니다.

```bash
python -B -c "import regex" || python -m pip install regex
python -B "${CLAUDE_SKILL_DIR}/scripts/check_x_post.py" <post-1.txt> ... <post-5.txt>
```

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | `산출`로 진행 |
| `1` | 초과분만큼 줄이거나 포스트 수를 다섯으로 맞춰 재실행 |
| `2` | 잘못된 호출 → 인자(Argument)와 파일 경로를 고쳐 재실행 |

> 거부되면 넘기지 않는다.

### 4. 산출

`releases/<example>/posts.md`에 포스트를 순서대로 쓴다. 첨부는 그 포스트 본문 아래에 링크로 적고, GIF는 `write-readme`가 생성한 파일이므로 새로 만들지 않는다.

```
## 포스트 1

<포스트 1>

## 포스트 2

<포스트 2>

## 포스트 3

<포스트 3>

[media/<example>.gif](media/<example>.gif)

## 포스트 4

<포스트 4>

## 포스트 5

<포스트 5>
```

## 규칙

- 문장 안의 세미콜론(Semicolon)과 엠 대시(Em Dash) 금지 → 마침표나 쉼표, 합성어의 하이픈(Hyphen)은 허용
- AI 티 제거, 행위자 없는 수동과 `not just X, it's Y` 대구까지
- 수치·이름 날조 금지
- 고쳐 쓴 문장은 `작성`과 `규칙`에 따라 재점검
