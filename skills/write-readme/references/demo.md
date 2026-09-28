## 순서

1. 어떤 run을 쓸지 질문
2. 고른 run을 `workspaces/<example>/demo/<id>/`로 복사
3. `replay.py`로 스크래치패드(Scratchpad)에 replay 폴더 생성
4. `yaml-for-everything:run`의 `local`에서 replay 폴더를 `up`
5. `capture_demo.py`로 캡처(Capture)
6. `close`

## run 질문

| 질문 | 선택지 | 답 |
| :---: | --- | --- |
| 어떤 run | 이 서비스의 호출 폴더 최대 4개, `workspaces/<example>/demo/*/`에 이미 있는 것 먼저, 그다음 `<temp>/yaml-for-everything/<example>/*/.outputs/*/*`의 `yaml-for-everything:run` `call` 폴더, 각각 경로와 텍스트 입력으로 표시, 나머지는 질문 본문에 적고 사용자 폴더는 자유 입력으로 받는다 | `multiSelect: true` |

- 호출 폴더가 하나도 없으면 질문에 그렇게 적고 사용자 폴더만 묻는다
- 워크플로(Workflow)의 입력과 출력을 모두 담은 run만 쓴다, 하나라도 빠지면 보고하고 제외하며 모델(Model)을 돌려 채우지 않는다
- `workspaces/<example>/demo/` 밖의 폴더는 `workspaces/<example>/demo/<id>/`로 복사하고 이후 단계는 복사본만 읽는다, 임시 폴더는 `run` 세션(Session)이 닫히면 사라지고 run이 사라진 GIF는 다시 찍을 수 없다

| 사용자 폴더 내용 | 행동 |
| :---: | --- |
| `call`이 남긴 `output.json` | 그대로 호출 폴더로 사용 |
| 낱개 파일 | 스크래치패드에 호출 폴더를 만든다, `output.json`은 워크플로 `output` 키마다 값을 담고 미디어 값은 옆에 둔 파일명으로 적는다, 워크플로 입력은 `<key>.txt` 또는 키 이름의 파일로 옆에 둔다, 키가 불분명한 파일은 묻는다 |

서비스 폴더에 남은 이전 캡처의 파일(e.g., `model-compose.yml` 옆의 `captured-output.json`)은 출처가 아니다. 지금 README가 설명하지 않는 run일 수 있다.

## 산출 경로

| 고른 run 수 | GIF 경로 |
| :---: | --- |
| 1 | `releases/<example>/docs/images/<example>.gif` |
| 2 이상 | run마다 `releases/<example>/docs/images/<example>-<id>.gif`, 캡처 명령도 run마다 하나 |

- README가 싣지 않는 캡처(스크린샷, 동영상, yml이 서빙하지 않는 인터페이스(Interface)의 GIF)는 `workspaces/<example>/media/`에 둔다
- 캡처에 실패한 run만 빠지고 나머지는 남는다

## replay

캡처는 모델을 돌리지 않고 저장된 run을 재생한다. replay는 저장된 출력을 몇 초 안에 그대로 돌려주므로, 화면의 진행 시간은 모델 속도가 아니다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/replay.py" releases/<example> \
  workspaces/<example>/demo/<id> <scratch>/replay/<example>
```

`<scratch>`는 세션의 스크래치패드 폴더다.

| 종료 코드(Exit Code) | 행동 |
| :---: | --- |
| `0` | 출력된 폴더를 서빙(Serving) |
| `2` | 오류를 그대로 보고, 워크플로 출력 누락은 `yaml-for-everything:compose`에서 고칠 일이고 replay에서 메우지 않는다 |

화면에 보이는 값은 모두 워크플로 `output`의 이름 있는 키여야 한다. 워크플로가 `output`을 선언하지 않았다면 마지막 job `output`의 키다. 키 없는 값은 replay가 돌려줄 수 없다.

| 인터페이스 | `up` | `--url` |
| :---: | --- | --- |
| 서비스 자체 UI | `--webui component` | 출력된 `component` 주소 |
| gradio | `--webui gradio` | 출력된 gradio 주소 |

## 캡처

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/capture_demo.py" --url=<up이 출력한 주소> \
  --gif=releases/<example>/docs/images/<example>-<id>.gif --duration=6000 \
  --setup workspaces/<example>/demo.gradio.js \
  --asset lyrics=workspaces/<example>/demo/<id>/lyrics.txt
```

- 워크플로 입력은 모두 `--asset <name>=<file>`로 넘기고, 파일이 아닌 텍스트 입력은 `.txt` 파일로 넘긴다
- 데모 파일이 없는 인터페이스는 어떤 입력을 골라도 빈 화면이 찍힌다, 캡처 전에 이를 알린다
- 캡처 전에 데모 파일을 읽고 모든 리터럴(Literal)을 이번 run과 대조한다, 한 run에 속한 값(프롬프트(Prompt), 제목)은 `--asset`으로 넘겨 읽고 데모 파일에 적지 않는다, 적힌 값은 이전 캡처의 값이 새 run 화면 위에 실패 없이 찍힌 것이다
- `--width`·`--height`는 녹화 크기(기본 1440×900), `--gif-width`는 GIF 폭(기본 960)
- `--screenshot=<path>`·`--video=<path>`로 다른 매체를 뽑는다
- 모든 매체에 `playwright`가 필요하고 GIF와 동영상은 `ffmpeg`도 필요하다
- 캡처가 실패하면 오류를 그대로 보고하고 그 매체를 빼며 다른 매체로 대체하지 않는다

## 데모 파일이 제공할 것

손대지 않은 인터페이스를 찍으면 빈 폼(Form)만 나오고, 서비스가 동작하는 모습이 아니다. 그래서 캡처는 서비스의 데모 파일을 실행해 폼에 run의 입력을 채우고 replay로 제출한다.

| 전역 | 실행 시점 | 용도 |
| :---: | --- | --- |
| `window.demoPerform` | 녹화 시작 직후 | 폼 채우기, 제출, 결과 대기, 재생, 스크롤 등 보여야 할 모든 동작 |

`async`여도 되고, `--asset` 이름을 인터페이스 옆에서 서빙되는 URL에 대응시킨 `window.demoAssets`를 읽는다. 없어도 캡처는 돈다.

어느 요소를 채우는지, 어느 버튼으로 제출하는지, 끝난 결과가 어떻게 보이는지는 모두 데모 파일에 둔다. 캡처 스크립트(Script)는 이를 모르기 때문에 음성 서비스와 음악 서비스에 같은 스크립트가 통한다.

```
✗ Teaching capture_demo.py about this service — its selectors, its labels, the field its
  output arrives in.
→ Put all of it in the service's own demo file.
Why: the next service draws a different form, and a capture script that knows one
service's shape has to be edited for every new one.
```

```
✗ Scrolling to the output when the play button the demo file looks for is not found.
→ Throw, naming what was not found, so the capture fails instead of passing.
Why: a fallback that skips the step the GIF was made to show still writes a GIF, and
nothing reports that the song never plays in it.
```

```
✗ Finding the play button by a label that merely contains "play".
→ Match the whole label, `Play`, after trimming it.
Why: gradio's audio player also carries a "playback speed" button ahead of it, so a
substring match clicks the speed control, the GIF shows the song sitting at 0:00, and
nothing fails.
```

## 실행 종료 판정

gradio 로그(Log)가 컴포넌트(Component)를 `component_type: shell`로 적는 것도 replay이기 때문이다.

```
✗ Waiting for a result element that the interface already shows before the run — a
  sample transcript, a placeholder list.
→ Wait for something the run changes: the submit button coming back, the title turning
  into the uploaded file's name.
Why: an element that exists before submitting passes the wait at once, and the capture
films the run still in progress while reporting success.
```

```
✗ Waiting for an `<audio>` element to appear before returning from window.demoPerform.
→ Wait for gradio's run button to read `Run Workflow` again after it read `Running...`.
Why: gradio draws its audio output without an `<audio src>` the page can find, so the
wait runs to its timeout, the setup throws, and no video is written at all.
```

## 캡처에 담기지 않는 것

```
✗ Filming the demo expecting an open native dropdown or an OS colour-picker dialog to
  appear in it.
→ Script the recording around states that do capture — the dropdown closed, or its
  result already applied.
Why: a native `<select>` popup and an OS dialog are drawn by the window system rather
than by the page, so no page capture contains them. Content the page itself positions
does capture.
```
