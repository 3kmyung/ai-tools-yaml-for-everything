---
name: write-post
description: Use when a service's README is finished and needs an X thread, or when the user says "X 포스트", "트윗", "스레드", "SNS 홍보".
allowed-tools: Read, Glob, Grep, Write, Edit, WebSearch, AskUserQuestion, Skill, Bash(python -B *), PowerShell(python -B *), Bash(python -m pip install *), PowerShell(python -m pip install *)
---

## 절차

### 1. 조회

| `releases/<example>/` 상태 | 행동 |
| :---: | --- |
| `README.md` | `작성`으로 진행 |
| `README.md` 없을 때 | 중단 → `yaml-for-everything:write-readme` 스킬(Skill) 호출 |

| 값 | 예시 | 출처 |
| :---: | --- | --- |
| README에 있는 값 | 수치, 조건, 기계, 단위 | README만, 웹 검색 결과로 덮어쓰기 금지 |
| GIF나 첨부 파일에 담긴 입력과 결과 | 캡션의 장르·가사·길이 | `AskUserQuestion`, 직접 조회 금지 |
| 모델(Model)의 성질 | 아키텍처(Architecture), 차별점, 고를 수 있는 모드 | 체크포인트(Checkpoint) 카드, 논문, 모델의 공식 리포지터리(Repository) |
| README에 없는 모델 규모 | 크기, 파라미터(Parameter) 수 | 체크포인트 카드, 양자화(Quantization) 배포판은 실제로 공개된 것만 |
| 그 밖에 README에 없는 모든 값 | GitHub나 Hugging Face의 ID, 스타(Star)·포크(Fork) 수 | 웹 검색 |

> 스타·포크 수처럼 매일 변하는 값은 반올림한다(e.g., `83K`).

### 2. 작성

`유형`으로 정한 유형의 `${CLAUDE_SKILL_DIR}/references/<type>.md`를 읽고 그 파일의 `스레드`와 `예시`대로 쓴다. X 전용, 영어, 각 포스트는 X Premium 장문의 가중 25,000자 제한 안이다.

### 3. 분량 검사

포스트를 하나씩 UTF-8 파일로 저장하고 순서대로 넘겨 아래를 실행한다. `.md`·`.py`·`.sh`가 실제 국가 도메인(Domain)이라 X가 파일명도 링크로 걸어 23자로 세므로, 눈으로 센 길이와 어긋나는 것은 결함이 아니다.

```bash
python -B -c "import regex" || python -m pip install regex
python -B "${CLAUDE_SKILL_DIR}/scripts/check_x_post.py" <post.txt>...
```

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | `산출`로 진행 |
| `1` | 초과분만큼 줄여 재실행 |
| `2` | 잘못된 호출 → 인자(Argument)와 파일 경로를 고쳐 재실행 |

> 거부되면 넘기지 않는다.

### 4. 산출

`workspaces/<example>/<type>.md`에 아래 틀대로 쓴다. 포스트마다 본문을 언어 태그 없는 코드 블록(Code Block) 하나에 넣고 포스트 수만큼 반복한다.

````
## 포스트 <번호>

```
<본문>
```
````

## 유형

| 요청 | 행동 |
| :---: | --- |
| 유형 지정 | 그 유형으로 `작성` 진행 |
| 유형 미지정 | `${CLAUDE_SKILL_DIR}/references/`의 파일명을 선택지로, 각 파일 `스레드`의 첫 문장을 설명으로 `AskUserQuestion` 선택 요청 |

## 규칙

- 워크플로(Workflow)의 잡(Job) 구성, 이 서비스가 고른 모드, `model-compose.yml`의 값을 모델의 성질로 쓰기 금지
- 문장 안의 엠 대시(Em Dash) 금지 → 세미콜론(Semicolon)으로 대체(e.g., `vs. Suno; same lyrics, same style`), 합성어의 하이픈(Hyphen)은 허용
- 문장마다 빈 줄로 떼어 단락 하나에 문장 하나 → 숫자 행 묶음만 빈 줄 없이
- AI 티 제거, 행위자 없는 수동과 `not just X, it's Y` 대구까지
- 수치·이름 날조 금지
- 라이선스(License)는 이름만(e.g., `CC BY-NC 4.0`) → 허가·제한 조건 요약 금지
- X는 마크다운(Markdown)을 그리지 않으므로 포스트 본문에 백틱(Backtick)과 마크다운 문법 금지 → 입력 문자열은 큰따옴표
- 고쳐 쓴 문장은 `작성`과 `규칙`에 따라 재점검
