## 서버 없는 명령

서버(Server) 없이 돌릴 명령과 파일 전송은 아래 명령을 쓴다.

| 명령 | 용도 |
| :---: | --- |
| `execute` | 가상 환경(Virtual Environment)의 `python`을 `PATH` 앞에 두고 명령 실행 |
| `execute --detach` | 오래 걸리는 명령을 연결이 끊겨도 기기에서 계속 실행 |
| `status` | 백그라운드(Background) 작업의 상태와 로그(Log) 끝부분 확인 |
| `upload`, `download` | 로컬과 기기 사이 파일 전송 |

```bash
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" execute <대상> [--directory <기기 경로>] [--detach] -- <명령>...
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" status <대상> [--job <번호>]
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" upload <대상> <로컬 경로> <기기 경로>
python -B "${CLAUDE_SKILL_DIR}/scripts/run.py" download <대상> <기기 경로> <로컬 폴더>
```

| 표기 | 뜻 |
| :---: | --- |
| `<로컬 경로>`, `<로컬 폴더>` | 현재 폴더 기준 |
| `<기기 경로>` | 작업 폴더 루트(Root) 기준 |

| 출력 | 할 일 |
| :---: | --- |
| `execute --detach`의 `job <번호> started` | 그 `<번호>`를 `status --job`에 사용 |

| 종료 코드 | 할 일 |
| :---: | --- |
| `0` | 결과 사용 |
| 그 밖의 종료 코드(Exit Code) | 출력 그대로 보고 |
