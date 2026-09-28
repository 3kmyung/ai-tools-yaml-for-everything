## 깔기

`releases/<릴리스>/`에서 돌린다. `--name`은 소문자 패키지(Package) 이름, `--title`은 브라우저 탭 제목이다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/scaffold.py" web --name <릴리스> --title "<제목>"
```

셸 테스트는 `releases/<릴리스>/web/test/`가 아니라 `workspaces/<릴리스>/web/test/`에 깔린다. 배포 폴더에는 빌드와 서빙에 필요한 것만 남는다.

| 출력 | 뜻 |
| --- | --- |
| `wrote releases/<릴리스>/web/<경로>` | 셸(Shell) 파일, 늘 덮어쓴다 |
| `wrote workspaces/<릴리스>/web/test/<경로>` | 셸의 테스트, 늘 덮어쓴다 |
| `created releases/<릴리스>/web/src/release/index.tsx` | 컴파일만 되는 빈 릴리스(Release)를 새로 만들었다 |
| `kept releases/<릴리스>/web/src/release/index.tsx` | 이미 있어서 건드리지 않았다 |
| 종료 코드 `2`, `is not releases/<release>/web` | `releases/<릴리스>/`가 아닌 곳에서 돌렸다 — 그 디렉터리로 옮겨 다시 돌린다 |

셸이나 `assets/`가 바뀌면 같은 명령을 다시 돌린다. 릴리스가 쓴 파일은 남는다.

이어서 `webui` 컴포넌트를 붙인다.

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/add_webui.py" .
```

| 출력 | 할 일 |
| --- | --- |
| `port <n>`, `excluded ports: ...` | 두 줄 그대로 `보고`의 포트 항목에 옮긴다 |
| `removed controller.webui: ...` | `보고`에 옮긴다. 이 앱이 기본 화면이 되고 gradio는 더 뜨지 않는다 |
| `controller.adapter.origins is not "*"` | 페이지와 API의 포트가 달라 교차 출처 요청이 되므로, `webui` 포트의 출처가 들어 있지 않으면 보고한다 |

`check_web.py`가 만든 `web/pnpm-lock.yaml`은 지우지 않고 릴리스와 함께 커밋한다. `webui` 컴포넌트의 `install`이 `--frozen-lockfile`이라 없으면 깨끗한 클론에서 설치가 실패한다.

## 디렉터리

```
releases/<릴리스>/                배포 폴더
├── model-compose.yml
└── web/
    ├── package.json            셸 — 템플릿에서 렌더링, 의존 버전 고정
    ├── index.html              셸 — 템플릿에서 렌더링
    ├── tsconfig.json           셸 — 템플릿에서 렌더링, 워크스페이스 테스트까지 타입 검사
    ├── vite.config.ts, pnpm-workspace.yaml, .gitignore, .env.example
    └── src/
        ├── app/, core/, features/, ui/, audio/, store/, lib/, api/, styles/, main.tsx
        │                       셸 — 한 글자도 고치지 않는다
        ├── release/            릴리스 — index.tsx의 defineRelease와 결과 카드
        └── domain/             릴리스 — 출력 해석 같은 순수 함수

workspaces/<릴리스>/              배포하지 않는 작업 폴더
├── captured-output.json        잡 id를 키로 저장된 실제 출력, 손대지 않는다
├── captured-output.<잡>.<필드>.<확장자>
│                               모델이 만든 바이트, 위 JSON의 __media__가 가리킨다
└── web/
    └── test/
        ├── api/, app/, audio/, core/, i18n/, lib/, store/, support/, ui/
        │                       셸의 테스트
        └── domain/             릴리스 — domain/의 테스트
```

`workspaces/<릴리스>/web/test/`는 `releases/<릴리스>/web/`의 거울 자리다. 테스트의 `../../src/...` 가져오기는 `releases/<릴리스>/web/src/`로 풀린다.

| 명령 | 워크스페이스가 있을 때 | 배포 폴더만 클론했을 때 |
| --- | --- | --- |
| `pnpm install`, `pnpm build`, `vite preview` | 통과 | 통과 |
| `pnpm typecheck` | `src/`와 워크스페이스 테스트를 함께 검사 | `src/`만 검사하고 통과 |
| `pnpm test` | 워크스페이스 테스트를 돈다 | `No test files found`로 종료 코드 `1`, 배포 폴더에는 테스트가 없다는 뜻 |

| 계층 | 들어가는 것 | 들어가면 안 되는 것 |
| --- | --- | --- |
| `src/release/` | `defineRelease` 값, `ResultCard`와 그 안에서만 쓰는 컴포넌트 | 출력 해석 로직, 셸 파일의 복사본 |
| `src/domain/` | `readResult`, 형식 변환, 시간·길이 포매팅 | `fetch`, `WebSocket`, React, DOM |
| `workspaces/<릴리스>/web/test/domain/` | `captured-output.json`을 읽어 `readResult`를 확인하는 테스트 | 셸 동작의 테스트 |

`domain/`이 얇으면 테스트할 것이 없어진다. 출력에서 화면으로 가는 변환은 컴포넌트가 아니라 `domain/`의 함수(Function)에 둔다.

| 셸이 고정한 것 | 바꿔야 하면 |
| --- | --- |
| `package.json`의 의존과 버전 | 스킬(Skill)의 `assets/templates/package.json`을 고친다 — 모든 릴리스가 같이 받는다 |
| `vite.config.ts`의 `resolve-workspace-tests` 플러그인(Plugin)과 `test.dir` | 없음 — 워크스페이스 테스트가 배포 폴더의 `src/`와 `node_modules/`를 찾는 길이다 |
| `tsconfig.json`의 `rootDirs`와 `paths` | 없음 — `typecheck`가 워크스페이스 테스트의 가져오기를 푸는 길이다 |
| `pnpm-workspace.yaml`의 `allowBuilds.esbuild` | 없음 — 빠지면 pnpm이 `ERR_PNPM_IGNORED_BUILDS`로 설치를 끝내지 못한다 |

서버 주소는 `defineRelease`의 `controller`(포트와 `base_path`)로 페이지 호스트 기준으로 만든다. 포트나 호스트가 다를 때만 `web/.env.local`에 `VITE_API_URL`을 넣고, 빌드 시점에 박히므로 바꾸면 다시 빌드(Build)한다.

## 띄우기

`model-compose`가 설치와 빌드와 기동을 직접 한다. 사람이 `pnpm build`를 따로 밟지 않는다. `add_webui.py`가 붙이는 `webui` 컴포넌트는 `web/`에서 `node`로 pnpm 설치, `vite build`, `vite preview --strictPort --host`를 부른다. 블록을 손으로 쓰거나 고치지 않는다.

| 하면 | 이유 |
| --- | --- |
| `[ pnpm, ... ]`, `[ node_modules/.bin/vite, ... ]`로 바꾼다 | Windows에서 `pnpm`과 `.bin/vite`는 `.cmd`라 셸 없이 실행하면 `FileNotFoundError: [WinError 2]`로 서버가 죽는다 |
| 릴리스 디렉터리 밖에서 `-f releases/<릴리스>/model-compose.yml`로 띄운다 | `working_dir`는 yml 위치가 아니라 `model-compose`를 띄운 작업 디렉터리 기준으로 풀린다. `yaml-for-everything:run`의 `up`은 늘 릴리스 디렉터리에서 띄운다 |

`model-compose.yml`에 허용된 편집은 `add_webui.py`가 하는 것뿐이다 — 컴포넌트 추가, 단수 `component:`를 리스트로 옮기기, 컴포넌트가 하나였고 잡이 `component:`를 적지 않았을 때만 그 컴포넌트에 `default: true` 붙이기(잡이 컴포넌트를 적었으면 붙이지 않는 것이 정상이다). 그 밖의 줄은 `yaml-for-everything:compose` 스킬의 것이므로, 고쳐야 할 것이 보이면 고치지 말고 보고한다.

| 만난 것 | 할 일 |
| --- | --- |
| 워크플로가 하나고 `id`가 없다 | `__default__`로 부른다 — 단수 `workflow:`는 `id`가 없는 것이 정상이고 서버가 그렇게 푼다 |

| 하면 | 이유 |
| --- | --- |
| `controller.webui.static_dir`을 `web`이나 `web/dist`로 맞춘다 | `static_dir`은 디렉터리를 통째로 마운트해서 `src/`와 `node_modules/`까지 공개되고, 경로가 파일 위치가 아니라 프로세스 작업 디렉터리 기준으로 풀려 어디서 띄웠는지에 따라 깨진다 |
