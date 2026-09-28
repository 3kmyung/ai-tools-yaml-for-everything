---
name: write-readme
description: Use when a service's benchmark results exist and its README needs the model, the run steps, the measured numbers and the demo GIF, or when the user says "서비스 README", "성능 섹션", "데모 GIF", "결과 정리".
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill, WebSearch, WebFetch, Bash, PowerShell
---

## 범위

측정을 마친 서비스의 `releases/<example>/`에 있는 모든 README에 모델(Model), 실행 단계, 측정값과 측정 조건, 동작하는 GIF를 채운다. 측정은 `yaml-for-everything:analyze-model`의 몫이고, 이 스킬(Skill)은 그 수치를 표로 옮기는 데서 멈춘다.

| 경로 | 이 스킬이 하는 일 |
| :---: | --- |
| `workspaces/<example>/` | 벤치마크(Benchmark) 파일, 데모 파일, 호출 폴더를 읽는다, 쓰는 것은 `demo/<id>/` 복사본과 `unmeasured/*.json`의 `reasons`뿐 |
| `releases/<example>/` | 모든 README, `LICENSE`, `docs/images/`의 GIF만 쓴다 |

`releases/<example>/`는 그대로 `github.com/MindrLabs/<example>`로 배포된다. README를 어떤 언어로 낼지는 무엇을 쓰든 먼저 정한다 → `references/language.md`. 번역본이 빠지면 완성이 아니다.

## 시작 조건

| `workspaces/<example>/analysis/` 상태 | 행동 |
| :---: | --- |
| `benchmark.json`, 그리고 모든 run이 `valid: true`인 `results/*.json` | 섹션 작성 → `references/readme.md` |
| 그 밖 | **중단** → `yaml-for-everything:analyze-model`로 넘긴다, 빠진 수치를 채워 넣지 않는다 |

수치는 `results/*.json`이나 `benchmark.json`에서 직접 읽지 않는다. `analyze-model`의 `validate_results.py`가 출력한 리포트(Report)로만 받는다.

| 리포트에 없는 기기 | 행동 |
| :---: | --- |
| `analysis/unmeasured/<machine>.json`이 있다 | `render_limits.py`가 그 사유를 `한계`에 싣는다 |
| 그 파일이 없다 | 사유를 지어내지 않고 사용자에게 보고 |

## 섹션

제목은 `# <example>`, 서비스 폴더 이름 그대로이고 모든 언어에서 같다. 제목 아래에 서비스에 무엇이 들어가고 무엇이 나오는지 한 문장을 쓴다. 근거는 `model-compose.yml` 워크플로(Workflow)의 입력과 `output`이다.

| 섹션(`README.ko.md` 헤딩) | 담는 것 |
| :---: | --- |
| 모델 | 모델만 다루는 한 문단, 모델이 무엇인지와 모델을 구별하는 아키텍처(Architecture) 특징 하나, 서비스의 job·워크플로·출력 언급 금지, 홍보 문구 금지 |
| 데모 | GIF 이미지 줄만, 문장·캡션 금지 |
| 빠른 시작 | `find_version.py`가 정한 model-compose 버전(링크 포함), 설치(uv와 pip)·클론(Clone)·`up`을 나눈 세 단계, UI 포트, 첫 실행이 내려받는 것 |
| 성능 | 렌더(Render)한 표와 `Measurement conditions` 블록, 해석 콜아웃(Callout) 하나 |
| 한계 | `render_limits.py` 출력 그대로 |
| 라이선스 | 라이선스(License)별 대상·링크·상업적 이용 여부를 담은 표 하나, 산문 금지 |

- 모델 카드(Model Card)에 이미 있는 내용은 어느 섹션에도 다시 쓰지 않고 카드를 링크
- 캡처 방법, 데모 준비 파일, 캡처 로그(Log)는 쓰지 않고 GIF가 보여 주는 것만 쓴다
- 헤딩(Heading), 표 머리글, 대체 텍스트(Alt Text)는 그 README 파일의 언어로 작성
- 섹션 헤딩은 언어마다 고정이고 `sync_check.py`가 다른 헤딩을 짚는다
- 표와 측정 조건 블록은 렌더 스크립트(Script)의 `--language`로 언어별로 뽑아 출력 그대로 옮긴다

## 데모 GIF

인터페이스(Interface)는 `model-compose.yml`로 정하고 사용자에게 묻지 않는다. GIF는 독자가 `model-compose up`으로 보는 화면이어야 하므로, yml이 서빙(Serving)하지 않는 `web/` 폴더는 대상이 아니다.

| `model-compose.yml` 선언 | 인터페이스 | 데모 파일 |
| :---: | --- | --- |
| `id: webui`인 컴포넌트(Component) | 서비스 자체 UI | `workspaces/<example>/demo.js` |
| `controller.webui`의 `driver: gradio` | gradio | `workspaces/<example>/demo.gradio.js` |
| 둘 다 없다 | 인터페이스 없는 서비스, `데모` 섹션에 API만 제공한다고 쓰고 GIF는 만들지 않는다 | |

캡처 전에 어떤 run을 쓸지 묻고 답을 기다린다. 서비스는 어떤 run이 자신을 가장 잘 보여 주는지 말해 주지 않으므로 기본값이 없다. 벤치마크 데이터셋(Dataset)은 데모 입력으로 내놓지 않고, 데모를 위해 모델을 새로 돌리지도 않는다. 질문, run 복사, replay, 캡처 명령은 `references/demo.md`를 따른다.

## 문체

모든 언어의 README에서 아래 형태를 확인한다.

| 형태 | 대신 |
| :---: | --- |
| `seamless`, `robust`, `powerful`, `effortless`, `cutting-edge`, `revolutionary`, `혁신적인`, `차세대`, `강력한`, `손쉽게` | 실제로 하는 일 |
| 불릿마다 굵은 라벨, `- **Speed:** the queue drains faster` | 표 또는 평문 |
| 행위자 없는 수동태, `the table was regenerated` | 누가 했는지 |
| 읽기 좋아서 셋으로 맞춘 나열 | 서비스에 실제로 있는 개수 |

| 규칙 | 적용 |
| :---: | --- |
| 출처에 근거가 없는 주장 | 의인화와 과장만 걷어 내고 주장은 남긴 뒤 근거를 묻는다, 지우면 실제 기능이 빠지고 다시 쓰면 없는 기능이 생긴다 |
| 고쳐 쓴 문장 | 다시 검사, 한 형태를 지우며 다른 형태를 넣은 초안은 깨끗하지 않다 |
| 섹션·언어 사이 | 서로 내용을 빌리지 않고 각자의 출처만 따른다 |
| 표 | 첫 열은 가운데 정렬, 구분 행은 칸마다 공백, `\| :---: \| --- \|` |
| 한 줄에 한 문장 | 콜아웃을 포함한 모든 문장을 새 줄에서 시작하고 문장 중간에서 줄바꿈하지 않는다, 문단은 빈 줄로 끝낸다 |

## 참조 파일

| 파일 | 읽는 시점 |
| :---: | --- |
| `references/language.md` | 무엇을 쓰든 먼저, 모든 README와 기준 파일, `sync_check.py` |
| `references/readme.md` | 제목 아래 문장, 섹션 작성, 모델 출처, 버전 줄, 성능표 렌더, 해석 콜아웃, 한계 렌더, 라이선스 표, `LICENSE` 파일 |
| `references/demo.md` | 데모 캡처, run 질문, replay, 캡처 명령, 데모 파일이 제공할 것 |

출처와 조건이 없는 수치는 README에 들어가지 않는다. 둘 다 렌더 출력에 이미 들어 있으므로 다시 타이핑하지 않고 옮긴다.
