## 실패 대응

`up`, `call`, `status`의 출력에 `diagnosis:` 줄이 있으면 그 줄의 원인과 할 일을 따른다.

| 증상 | 원인 | 할 일 |
| --- | --- | --- |
| `open`이 호스트(Host) Python, `ensurepip`, `ffprobe` 문제 출력 후 진행 | 작업 폴더 안 자동 해결 | 다음 단계 진행 |
| `up --webui component`가 `node`, `pnpm` 부재로 중단 | 설치 불가한 시스템 프로그램 | 출력 그대로 보고 후 중단 |
| 컴포넌트(Component)가 파일을 찾지 못하고 실패 | `model-compose.yml`이 참조하는 파일 부재 | 출력 그대로 보고 |
| 경고만 뜨고 완주 | 지원 밖 조합 | 결과와 경고 그대로 보고 |
| 손으로 설치한 패키지(Package) 복귀 | 컴포넌트 런타임(Runtime)이 매 실행 재설치 | 원인 수정 후 `close`, 새 `open` |
| 터널(Tunnel) 무응답 | SSH 끊김 | 재연결 대기, 계속 실패하면 `close` 후 보고 |

## 금지 사항

| 금지 | 대안 |
| --- | --- |
| 기기의 호스트 Python 교체, `apt install`로 의존성 설치 | 작업 폴더 안의 uv Python과 가상 환경(Virtual Environment) |
| `--ignore-requires-python`으로 최소 버전 우회 | `open`이 설치하는 uv Python |
| `pip install model-compose`로 PyPI 배포본 사용 | `open`이 설치한 이 리포지터리(Repository)의 코드 |
| 컴포넌트 가상 환경에 손으로 패키지 설치 | 원인 수정 후 `close`, 새 `open` |
| 하드웨어 문제를 CPU나 다른 추론(Inference) 스택(Stack)으로 우회 | 그 기기의 실패로 보고 |
| 소스 덮어쓰기 | 다른 `<ref>`에 수정이 있으면 `--ref` |
