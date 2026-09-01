# YouTube 플레이리스트 비디오

YouTube 링크 목록을 하나의 연속된 비디오로 만듭니다. 브라우저 에디터가 함께
들어있습니다.

## 개요

`render-playlist`가 `tracks` 리스트를 받아서:

1. 이미 로그인해 둔 Chrome에서 YouTube 쿠키를 읽어옵니다. 그래서 제한이 걸린
   영상도 공개 영상처럼 내려받습니다 — 세션이 없으면 멈춰서 로그인을 요청합니다.
2. 항목마다 private `render-track` 서브워크플로우로 렌더링하며, 동시에 몇 개씩만
   진행시키고 결과는 순서대로 다시 모읍니다.
3. 클립들을 이어붙이고, 에디터가 재생할 수 있는 위치에 결과를 게시합니다.

트랙 하나당: 오디오를 내려받고, 라우드니스를 정규화하고, 거기서 프레임별
스펙트럼을 뽑은 뒤, 헤드리스 브라우저에서 HTML 템플릿으로 모든 프레임을 렌더링해
오디오와 먹싱합니다. 트랙 하나가 실패하면 그 항목만 빠지고, 나머지로 만들지
물어보기 위해 멈춥니다.

## 템플릿

**[`ui/templates/`](./ui/templates/)의 템플릿들이 프레임이 어떻게 보이는지에 대한
유일한 진실 공급원(single source of truth)입니다** — 워크플로우는 커버 아트,
팔레트, 스펙트럼만 넘겨줄 뿐 픽셀 처리는 전혀 직접 하지 않습니다. 각 템플릿은
하나의 파일명을 공유하는 세 파일(마크업, 스타일, 프레임마다 도는 그리기 스크립트)
이고, 그 파일명이 곧 템플릿을 고르는 `style` 값입니다. 새로 추가하려면 세 파일을
새 이름으로 복사하고, 복사한 마크업이 자기 두 파일을 가리키게 고친 다음, 그 이름을
`model-compose.yml`의 `style` 옵션과 에디터의 스타일별 상수에 등록하면 됩니다.

템플릿은 다섯 가지 화면 비율의 *논리* 스테이지를 기준으로 레이아웃하고, 공유
런타임이 이를 렌더의 해상도에 맞게 스케일링합니다. 에디터의 프리뷰도 같은 코드를
돌리되, 편집 시점의 트랙은 아직 URL일 뿐이라 합성 스펙트럼으로 대체합니다.

## 색

팔레트(primary, secondary, accent, text)는 그냥 입력값이며 `model-compose.yml`은
이걸 계산하지 않습니다. `tracks[]` 항목마다 자기 `colors`를 들고 있고, 렌더는 받은
것을 그대로 넘기며, 없으면 중립적인 기본값으로 떨어집니다.

커버에서 팔레트를 뽑는 일은 전부 브라우저 안에서 일어납니다. 에디터가 커버의 색을
양자화해서 팔레트를 제안하고, 사용자가 그대로 쓰거나 고친 뒤, 제출 시점의 값이
그대로 전송됩니다. 그래서 렌더는 프리뷰와 어긋날 수가 없습니다 — 자기 색을 계산하지
않으니까요. CLI에서는 추출을 직접 돌려서 그 결과를 `colors`로 넘겨야 합니다.

## 라우드니스

YouTube는 업로더가 마스터링한 음량을 그대로 돌려주므로, 서로 다른 영상에서 모은
플레이리스트는 클립이 바뀔 때마다 볼륨이 튑니다. 정규화는 기성 컴포넌트로
해결되며, 숫자보다 모드가 더 중요합니다: LUFS는 진폭이 아니라 통합
라우드니스(ITU-R BS.1770)를 측정하고, 게인을 트루 피크 실링 아래로 묶습니다.
파이썬 패키지 두 개가 더 필요하며([필수 요구사항](#필수-요구사항) 참고), 피크
리미트를 건 RMS 모드는 numpy 외에 아무것도 필요 없지만 두 트랙이 실제로 얼마나
크게 *들리는지*까지 맞춰주지는 못합니다.

## 준비사항

### 필수 요구사항

- model-compose 설치
- Google Chrome(또는 Chromium) — 로그인 단계가 여기에 붙습니다
- `PATH`에 `ffmpeg`(그리고 `ffprobe`)
- Playwright Chromium: `playwright install chromium`
- `yt-dlp`: `pip install yt-dlp`
- yt-dlp의 안티봇 솔버용 JS 런타임 — `deno`를 설치하세요. 없으면 다운로드가
  `Requested format is not available`로 실패합니다
- `pedalboard`와 `pyloudnorm`: `pip install pedalboard pyloudnorm`
  (LUFS에만 필요. 대안은 [라우드니스](#라우드니스) 참고)

### 원격 디버깅으로 Chrome 실행

평소 쓰는 세션과 충돌하지 않도록 전용 프로필을 쓰세요:

**macOS**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-yt-profile
```

**Linux**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-yt-profile
```

**Windows (PowerShell)**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir=$env:TEMP\chrome-yt-profile
```

그 창을 열어둔 채로 YouTube에 로그인해 두세요. 프로필을 지우거나 구글이 쿠키를
만료시키기 전까지 세션은 실행 사이에도 유지됩니다.

### 환경 구성

```bash
cd examples/media-processing/youtube-to-playlist-video
```

`RENDER_CONCURRENCY`가 동시에 렌더할 트랙 수를 정합니다. 작게 유지하세요:
라우드니스 정규화가 디코딩된 트랙 전체를 메모리에 들고 있으므로, 동시성을 늘리면
CPU가 아니라 RAM이 먼저 나갑니다.

## 실행 방법

1. **서비스 시작**

   ```bash
   model-compose up
   ```

2. **에디터 열기** — http://localhost:8081

   트랙을 추가하고 링크를 붙여넣으면 제목·아티스트·커버·팔레트가 알아서 채워집니다.
   원하는 걸 고치고, 상단 바에서 스타일과 출력 설정을 고른 다음 Render를 누르면
   됩니다.

3. **또는 HTTP로 렌더 실행**

   `render-track`은 private이며, 공개된 렌더 워크플로우는 `render-playlist`
   하나뿐이므로 트랙 하나는 항목이 하나인 `tracks` 리스트가 됩니다:

   ```bash
   curl -X POST http://localhost:8080/api/workflows/runs \
     -H 'Content-Type: application/json' \
     -d '{"workflow_id":"render-playlist","wait_for_completion":true,"output_only":true,
          "input":{"fps":30,"width":1080,"height":1920,
                   "tracks":[{"youtube_url":"https://www.youtube.com/watch?v=...",
                              "title":"Track Title","artist":"Artist Name"}]}}'
   ```

   `youtube_url` 말고는 전부 선택사항입니다. `style`에는 템플릿의 파일명을 넣습니다.
   `cover_image`는 서버가 직접 여는 파일시스템 경로이며 URL이 아닙니다. 생략하면
   커버 아트 없이 렌더됩니다. `colors`는 해당 트랙의 `tracks[]` 항목 안에 넣습니다.
   응답에는 완성된 비디오의 경로와 그 비디오가 서비스되는 URL이 담깁니다. 이 경로도
   로그인 단계를 그대로 도므로 Chrome을 기다리며 멈출 수 있고, 그럴 땐 태스크 API로
   이어서 진행시킵니다.

## 참고사항

- `yt-dlp`가 오디오를 재생하지 않고 직접 내려받으므로, 실제 재생을 녹화하는 것보다
  훨씬 빠릅니다
  ([capture-youtube-video](../../web-automation/capture-youtube-video/)와 비교).
- 원본 영상의 이용약관과 저작권을 존중하세요.
- 비디오와 커버는 에디터가 HTTP로 서빙할 수 있도록 `ui/.output/` 아래에, 중간
  오디오는 `.output/`에 떨어집니다. 둘 다 gitignore 대상입니다.
