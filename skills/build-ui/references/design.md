## 사실부터 모은다

`extract_facts.py`가 `model-compose.yml`과 저장된 출력에서 아래 사실을 뽑는다. 릴리스(Release)가 채우는 모든 값은 그 출력의 어느 행에서 나와야 한다. 어느 행에서도 안 나오는 값은 지어낸 것이다.

| 어디서 | 뽑는 것 |
| --- | --- |
| 워크플로의 `id`, `title`, `description` | `workflows`의 `id`와 문구 재료 |
| `${input.*}`를 읽는 `action` 필드 | 입력의 종류와 개수 |
| `as <타입>` 어노테이션 | 입력이 계약의 어느 필드로 가는지 |
| `\| 기본값` | 옵션 칩의 `defaultValue` |
| UI에 넣은 워크플로가 닿는 다른 `action`에 적힌 리터럴 값, `select/` 목록 | 옵션 칩의 나머지 `choices` — `extract_facts.py --workflow`로 좁힌 후보만 |
| 컴포넌트의 `type`과 `action` 이름 | `as file`이 오디오·이미지·영상 중 무엇인지 — yml에 적힌 사실이라 모델(Model) 조사가 아니다 |
| 잡(Job)의 개수와 `depends_on` | `steps`에 이름 붙일 단계 |
| 워크플로 `output`의 `as stream` 여부 | 배치인지 스트리밍인지 |
| 저장된 출력의 필드 | 결과 카드가 그릴 수 있는 것 전부 |
| 사람이 올린 입력 파일 | 결과 카드가 다시 보여줄 수 있는 것 — 재생, 미리보기, 파일에서 읽히는 길이와 파형 |

## 셸이 정한 것

`scaffold.py`가 깐 셸(Shell)이 앱의 골격을 전부 갖고 있다. 릴리스는 이것을 다시 만들지 않는다.

| 영역 | 셸이 하는 일 |
| --- | --- |
| 사이드바 | 실행 기록을 IndexedDB에 저장, 최근순 묶음, 이름 바꾸기, 삭제 |
| 빈 화면 | `eyebrow`, `headline`, 워크플로가 둘 이상이면 선택 카드, 입력창 |
| 입력창 | 첨부 슬롯, 입력 칸, 워크플로 선택 칩, 옵션 칩, 보내기와 멈추기 |
| 스레드 | 보낸 것 요약 말풍선 → 진행·결과·실패·취소 카드, 다시 시도 |
| 실행 | 파일 소켓 업로드, `job_event` 단계, `cancel` 전송 |
| 부품 | `ui/`의 버튼·칩·시트, `ui/audio/`의 플레이어와 점 파형, `ResultFrame` |

릴리스가 쓰는 곳은 `releases/<릴리스>/web/`의 `src/release/`, `src/domain/`과 `workspaces/<릴리스>/web/test/domain/` 셋뿐이다. 셸이 이 출력에 모자라면 셸을 고치지 않고 보고하고 멈춘다.

## 입력

`src/release/index.tsx`의 `defineRelease`에 채운다. `controller`의 `port`와 `basePath`는 사실 표 `Controller` 절의 `controller.adapter.port`, `controller.adapter.base_path` 그대로다 — yml의 포트가 바뀌면 이 값도 같이 바꾸고 다시 빌드한다. 어노테이션이 없는 필드는 문자열이다.

사람이 읽는 값은 전부 `Localized`(`{ en, ko, zh }`)로 채운다 — `name`, `eyebrow`, `headline`, `caption`, 워크플로 `label`·`description`, 단계 `label`, 입력 칸 `placeholder`·`missing`, 첨부 `label`·`hint`·`missing`, 옵션 `label`, 선택지 `label`·`description`, 실패 `title`·`hint`, `findBlockedReason`의 반환값. 속성은 한 줄에 하나씩 쓴다 — `verify.py`가 `ko:`·`zh:` 줄 밖의 한글과 한자를 잡는다.

| 어노테이션 | 계약 필드 |
| --- | --- |
| `as audio` | `files` — `canRecord`는 아래 규칙 |
| `as image`, `as video`, `as file` | `files` — `accept`는 위 사실 표에서 가린 매체로. `as file`이어도 매체가 오디오면 `as audio`와 같은 `canRecord` 규칙 |
| `as text`, `as markdown`, 없음, `;format=url`, `;format=path` | `prompts` — 캡처가 이 필드를 비운 채 종료 코드 `0`으로 끝났으면 `optional: true` |
| 기본값이 있는 필드 | `options` |
| 기본값 없는 `as integer`, `as number`, `as boolean`, `as json`, `as object`, `as list` | 계약에 자리가 없다 → 보고하고 멈춘다 |

`prompts`는 배열이고 **마지막 항목이 본문 입력칸**(여러 줄, 자동 확장)이다. 앞의 항목들은 그 위에 한 줄 입력으로 쌓인다. 긴 것을 마지막에 두고, 짧은 것을 앞에 둔다 — 스레드 말풍선은 마지막 항목을 본문으로 읽고 앞의 것들은 요약 줄에 붙인다.

| 규칙 | 이유 |
| --- | --- |
| `canRecord`는 기본 끔, 입력이 그 자리에 있는 사람의 목소리여야 하는 컴포넌트(음성 복제의 참조 음성)만 켠다 | 이미 있는 파일을 처리하는 쓰임에 녹음 버튼은 안 쓰이는 컨트롤이 된다 |
| `choices`는 사실 표의 선택지 후보만, 후보가 기본값 하나면 그 필드를 `options`에서 빼고 `buildInput`에도 넣지 않는다 | yml에 없는 배율이나 강도 값을 선택지로 지어내면 서버가 받아도 검증된 적 없는 값이 된다. 보내지 않은 필드는 서버가 yml의 `\| 기본값`으로 채우므로 값을 하드코딩하면 yml과 어긋날 자리만 생긴다 |
| 칩과 선택지의 `label`은 값을 사람이 읽는 말로 옮긴다, 단위는 컴포넌트 `type`이 그 필드를 해석하는 단위로 컴포넌트가 그 필드를 어떤 단위로 읽는지 사실 표에서 가려 값에 붙이고, 열거값은 그 값이 무엇을 뜻하는지로 옮긴다. 단위를 모르면 리터럴 그대로 두고 보고한다 — 날것의 리터럴은 무엇을 고르는지 말하지 않는다 |
| 첨부 슬롯의 `hint`는 이 파일로 무엇을 하는지 쓴다 | `wav·mp3` 같은 형식 목록은 yml에 없어 지어낸 것이 된다 |
| 워크플로가 여럿이면 모두 `workflows`에 넣고, 한쪽에만 있는 필드는 `workflows`로 한정한다 | 선택 칩으로 바꿨을 때 없는 입력이 남으면 안 눌리는 컨트롤이 된다 |
| 잡이 둘 이상이면 `workflows[].steps`에 잡마다 사람이 읽을 이름을 준다 | 잡 `id`가 그대로 뜨면 진행 카드가 내부 이름을 읽힌다 |
| `failures`의 `pattern`은 실제로 본 오류 문구에서만 뽑는다 | 본 적 없는 오류를 위한 문구는 맞는지 아무도 모른다 |

## 출력

셸은 배치만 그린다. `as stream` 워크플로는 `capture_output.py`가 종료 코드(Exit Code) `4`로 먼저 멈춘다.

모델이 만든 바이너리는 배치여도 소켓으로 따로 내려온다. 캡처와 셸이 그것을 대신 받아 두므로 `readResult`가 보는 것은 늘 아래 참조 하나다.

| 어디서 | `__media__`가 담은 것 |
| --- | --- |
| `captured-output.json` | `file`(옆에 저장된 사이드카 파일 이름), `content_type`, `size`, `attrs` |
| 실행 중인 앱 | `blob_id`(셸이 저장한 blob), `content_type`, `size`, `attrs` |

`attrs`는 서버가 붙인 값이라 `sample_rate`, `channels`, `bit_depth`처럼 그 매체를 읽는 데 필요한 것이 들어 있다. `readResult`는 이 참조를 그대로 결과에 담고, 바이트를 푸는 것은 `ResultCard`가 `useResultMedia`로 한다 — `domain/`은 부수 효과를 쓸 수 없으므로 여기서 바이트를 만지지 않는다. `audio/pcm`은 셸이 `attrs`로 WAV 머리를 붙여 재생 가능한 blob으로 준다.

`readResult`는 `captured-output.json`과 같은 모양(잡 `id` → 출력)을 받아 결과를 만든다. 이 변환은 `src/domain/`에 두고, `workspaces/<릴리스>/web/test/domain/`의 테스트가 셸의 `test/support/captured-output.ts`에 있는 `readCapturedOutput()`(워크플로가 여럿이면 `readCapturedOutput("<workflow-id>")`)으로 저장된 출력을 읽어 확인한다. 경로를 직접 조립하지 않는다.

| 저장된 출력이 담은 것 | `ResultCard`가 그리는 것 |
| --- | --- |
| 시간 구간 목록 | `AudioTrack`의 `regions`와 구간 목록(행 구분선은 셸 `ui/styles/surface-classes`의 `TABLE_RULE`), 누르면 `player.playFrom`, 재생 중인 구간은 셸 `lib/time-ranges`의 `findRangeAt`으로 찾아 강조 |
| 모델이 만든 오디오(`__media__`) | `useResultMedia(<참조>)` → `useBlobUrl` → `useAudioAnalysis`(파형 `peaks`) → `useAudioPlayer({ source, playback, playerId: meta.replyId })` → `AudioTrack` |
| 사람이 올린 오디오 | `useStoredFile(request.files.<필드>)`로 시작해 위와 같은 사슬 — 분석이 끝나기 전에도 `AudioTrack`은 늘 렌더하고 `peaks`만 빈 배열로 준다 |
| 모델이 만든 이미지·영상(`__media__`) | `useResultMedia` → `useBlobUrl` → `<img>`, 셸 플레이어 밖의 영상이면 보고 |
| 긴 텍스트 | `text-read` 본문, 복사와 저장 |
| 점수나 라벨 목록 | 값 순으로 정렬된 목록 |

| 규칙 | 이유 |
| --- | --- |
| 카드는 `ResultFrame`으로 감싸고 요약은 `header`, 목록은 `footer`에 둔다 | 실행 시간과 원본 JSON 저장은 이 틀이 카드 맨 끝에 붙인다 |
| 카드 문구는 `Localized` 상수로 두고 `ResultProps`의 `pick`으로 그린다, 모델 출력 텍스트는 번역하지 않는다 | 언어를 바꿔도 기록된 결과가 그 언어로 다시 그려진다 |
| 브라우저 기본 `<audio controls>`, `<video controls>`를 쓰지 않는다 | 다크 모드에서 밝은 컨트롤만 튀고, 셸 플레이어와 다른 조작이 된다 |
| 초 단위 출력은 셸 `lib/format-time`의 소수 둘째 자리 함수(`formatSeconds(seconds, locale)`, `formatPreciseClock`)로 표시한다 | `0:03`은 `3.50`초의 경계를 지우고, `3.500952초`는 읽히지 않는다. 원본 값은 `ResultFrame`의 JSON 저장에 남는다 |
| 출력 필드끼리 계산한 값(구간 길이, 합계, 개수)은 올려도 된다, 단 항목이 빠진 줄 아는 종류로는 개수와 합계를 내지 않는다 — 종류 단위라 한 종류만 빠졌으면 다른 종류의 개수는 올린다. 항목을 묶어 보여주면(연속된 같은 값끼리 한 문단) 개수도 화면에 보이는 묶음 기준으로 센다 | 사실에서 나온 값이다. 빠진 항목을 세면 그림에는 셋이 보이는데 문구는 둘이라고 하는 식으로 화면이 자기와 어긋난다 |
| 미디어 길이는 `useAudioAnalysis`가 `ready`일 때의 `analysis.durationSeconds`로 표시하고, 그 전에는 길이 자리를 비워 둔다. `readResult`에서 `size`와 `attrs`로 계산하지 않는다 | 브라우저가 파일을 직접 풀어 잰 값이라 플레이어 시계와 늘 같다. `attrs`는 서버가 붙인 꼬리표라 빠질 수 있고, 빠지면 `0.00`초가 된다. 머리 크기를 44바이트로 가정한 계산은 WAV가 아닌 형식에서 틀린다 |
| 모델이 만든 미디어에는 원본 JSON과 별도로 받을 길을 둔다 | `ResultFrame`이 붙이는 JSON에는 바이트가 아니라 `__media__` 참조만 있다 |
| `useResultMedia`가 준 blob이 아직 없을 때도 카드는 렌더하고 빈 파형을 준다 | 읽어 오는 동안 카드가 사라지면 결과가 왔다 갔다 하는 화면이 된다 |

## 문구

| 규칙 | 예 |
| --- | --- |
| `en`은 짧은 평서문과 문장형 대문자, `ko`는 해요체, `zh`는 간체 짧은 평서문 | 세 언어를 같은 자리에 나란히 쓴다 |
| 세 언어가 같은 뜻을 말한다, 한 언어에만 있는 정보를 두지 않는다 | 한 언어에만 있는 괄호 설명을 넣지 않는다 |
| 필드 이름, 잡 `id`, 워크플로 `id`를 화면에 내지 않는다 | 필드 이름을 괄호로 덧붙이지 않는다 |
| `eyebrow`는 무엇으로 도는지(컴포넌트 `type`이나 `model`), `headline`은 이 워크플로가 해 주는 일 | 사실 표의 `Components` 절과 워크플로 `title`·`description`에서 가져온다 |
| 컨트롤이 무엇을 하는지로 쓴다 | "seamless", "powerful", "intelligent" 같은 말은 쓰지 않는다 |

## 지어내지 않는다

| 하면 | 그 대신 | 이유 |
| --- | --- | --- |
| 숫자, 이름, 인용을 카드가 비어 보여서 채운다 | 저장된 출력에서 그리거나, 요소를 빼고 빈 문구를 보여준다 | 지어낸 값은 정직해 보이면서 거짓이라 빈자리보다 나쁘다 |
| 안 눌리는 버튼이나 탭을 결과 카드에 둔다 | 연결하거나 뺀다 | 죽은 컨트롤 하나가 작동하는 부분까지 의심하게 만든다 |
| 상태 없는 배지를 단다 | UI가 읽을 수 있는 실제 상태에만 배지를 단다 | 기능의 모양을 한 장식이다 |

> 안티슬롭 규칙은 [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop)(MIT)에서 추렸고, 겹치는 곳에서는 이 스킬(Skill)이 결정한다.
