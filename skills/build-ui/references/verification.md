## 명령

`releases/<릴리스>/`에서 돌린다. 스크립트(Script)가 `verify.py`, `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm build`를 순서대로 돌리고 첫 실패에서 멈춘다. 실패하면 출력을 그대로 보고하고, 고친 뒤 `화면 확인`까지 처음부터 다시 돌린다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/check_web.py" web
```

| 실패한 단계 | 뜻 |
| --- | --- |
| `verify.py`의 `differs from assets/`, `missing` | 셸(Shell) 파일을 고쳤거나 지웠다 — `scaffold.py`를 다시 돌린다 |
| `verify.py`의 `ships with the release` | 테스트나 캡처가 배포 폴더에 남았다 — 출력된 `workspaces/<릴리스>/` 자리로 옮긴다 |
| `verify.py`의 그 밖의 줄 | 릴리스(Release) 코드가 토큰 밖의 값, 허용 폴더 밖의 파일, `domain/`의 부수 효과, 기본 미디어 컨트롤을 썼거나 캡처 기반 테스트가 없다 — 출력된 줄대로 고친다 |
| `test`의 셸 테스트 | 릴리스가 셸의 계약을 어겼다 — 셸이 아니라 `src/release/`를 고친다 |
| `typecheck` | `readResult`나 `ResultCard`가 저장된 출력의 모양과 어긋난다 |

Windows 경로 길이 한계로 `ERR_PACKAGE_IMPORT_NOT_DEFINED`가 나면 스크립트가 짧은 경로에 복사해 다시 돌리고 알려준다. 코드 문제가 아니다.

## 화면 확인

`webui` 컴포넌트가 설치·빌드·기동까지 하므로 이것이 출하 경로의 확인이기도 하다. `yaml-for-everything:run` 스킬로 릴리스를 새로 열고 `up --webui component`로 띄운다. `<webui-url>`은 `up`이 출력한 `component` 주소, 스크린샷 폴더는 `C:/Temp/<릴리스>-screens`다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/shoot_screens.py" --url=<webui-url> --out-directory=C:/Temp/<릴리스>-screens --file=<필드>=<캡처에 쓴 파일> --prompt=<필드>="<캡처에 쓴 텍스트>" --lang=en
python -B "${CLAUDE_SKILL_DIR}/scripts/shoot_screens.py" <같은 인자> --lang=ko --only-sample
python -B "${CLAUDE_SKILL_DIR}/scripts/shoot_screens.py" <같은 인자> --lang=zh --only-sample
```

`--file`은 첨부 슬롯마다, `--prompt`는 입력 칸마다 그 칸의 필드 이름과 캡처에 쓴 텍스트로 넘긴다 — 캡처에 없는 텍스트를 지어 넣지 않는다. `shoot_screens.py`는 빈 화면을 아래 세 크기 × `light`·`dark`로 찍고, 캡처와 같은 입력으로 실제 실행해 진행 카드, 결과 스레드 여섯 장, 결과 카드 맨 위(`result-top-*`), 새로고침 후 복원된 스레드를 찍는다. `result-top-*`에서 `header`를 확인한다. 이 전체 세트는 영어(`--lang=en`)로 찍고, `ko`와 `zh`는 `--only-sample`로 `empty-1440-light.<lang>.png`와 `result-top-1440-light.<lang>.png` 두 장만 찍는다. `--lang`은 주소에 `?lang=`을 붙여 브라우저 설정과 상관없이 언어를 고정한다. 종료 코드 `1`이면 결과 대신 실패·취소 카드가 떴거나, 시간이 넘었거나, 가로로 넘친 것이다 — 출력된 카드 문구를 그대로 보고한다. 어느 경우든 `yaml-for-everything:run`의 `close`로 닫는다.

| 폭 × 높이 | 보는 것 |
| :---: | --- |
| 1440 × 900 | 사이드바와 가운데 열 |
| 800 × 1024 | 사이드바가 접히는 지점 |
| 390 × 844 | 한 열, 상단바 |

잡(Job)이 빨라 진행 카드가 찍히기 전에 끝나면 `shoot_screens.py`가 `note:`로 알려준다. 그 경우 `미검증`에 적는다. 결과 카드의 클릭과 재생 동작은 스크립트가 누르지 않으므로 이것도 `미검증`에 적는다.

| 직접 Chrome을 부르지 않는 이유 | 내용 |
| --- | --- |
| `--window-size` | Windows 헤드리스는 이 값을 무시하고 창을 최소 크기로 늘린 뒤 스크린샷만 잘라낸다. 390을 달라고 하면 518폭 레이아웃을 390으로 자른 그림이 나와서, 진짜 가로 넘침과 구별되지 않는다 |
| `--force-dark-mode` | 먹지 않는다. 붙인 그림과 안 붙인 그림이 바이트 단위로 같다. 게다가 헤드리스 기본이 어두운 쪽이라 그냥 찍으면 기대와 반대가 나온다 |

`shoot_screens.py`와 `screenshot.py`는 `Emulation.setDeviceMetricsOverride`와 `Emulation.setEmulatedMedia`로 대신하고, 자기가 띄운 Chrome만 프로세스 ID로 닫는다 — `taskkill /IM chrome.exe`는 사람이 쓰던 창까지 전부 닫으므로 쓰지 않는다.

## 마지막 점검

허용 폴더, `domain/`의 부수 효과, 기본 미디어 컨트롤, 캡처 기반 테스트는 `verify.py`가 이미 잡는다. 찍은 화면과 쓴 코드를 나머지 아래 전부에 대본다.

- 사실 표에 없는 숫자, 이름, 선택지가 화면에 있는가
- 틀린 줄 아는 출력 필드를 화면에 올렸는가
- 결과 카드에 안 눌리는 컨트롤이 있는가
- 초 단위 값을 셸의 소수 둘째 자리 함수 없이 표시했는가
- 옵션 칩에 yml의 리터럴 값이 그대로 보이는가
- 화면에 필드 이름이나 잡 `id`가 보이는가
- 세 언어 스크린샷에서 셸과 릴리스 문구가 그 언어가 아니거나, 언어 문체(`en` 평서문, `ko` 해요체, `zh` 간체)를 벗어나거나, 한 화면에 언어가 섞였는가 — 모델 출력 텍스트는 제외
- 세 언어 중 한 언어에서만 글자가 넘치거나 잘리는가
- 모델이 만든 미디어 중 받을 길이 없는 것이 있는가
- `captured-output.json`이 가리키는 사이드카 파일이 `workspaces/<릴리스>/`에 같이 있는가
- `model-compose.yml`에서 `add_webui.py`가 더한 컴포넌트 말고 다른 줄을 고쳤는가
- 출력 모양 두 가지를 다 받는 폴백이 남았는가

하나라도 걸리면 고치고 `명령`부터 다시 돌린다.
