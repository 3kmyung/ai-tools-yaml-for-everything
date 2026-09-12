# X thread — VibeVoice-ASR

Korean, X only. Post 1 carries the media. The GitHub link goes in a reply to post 1,
posted after the thread, never in post 1 itself.

## Post 1 — attach `media/transcribe-long-meeting.png`

```
VibeVoice-ASR은 회의 녹음을 한 번에 받아적으면서 누가 말했는지와 시각까지 같이 뱉는
음성 인식 모델이다.

RTX 4090에서 17분 30초짜리 4인 회의를 3분 54초에 끝냈다. 실시간의 4.5배.
```

Character count: 118. One number, and it is the one the reader can feel.

## Post 2

```
보통은 받아적는 모델과 화자를 나누는 모델을 따로 돌리고 결과를 붙인다.
얘는 한 번의 디코딩에서 단어, 화자, 시각이 같이 나온다.

24000 Hz 오디오를 초당 7.5개 토큰으로 압축해서 1시간을 27000 토큰에 담는다.
그래서 컨텍스트 안에 한 시간이 들어간다.
```

## Post 3

```
같은 회의를 3대에서 돌렸다.

RTX 4090   RTF 0.22
DGX Spark  RTF 0.95
M1 16GB    RTF 1.08  (4bit MLX 변환본)

M1은 실시간보다 느리다. 대신 16GB 노트북에서 5.71GB짜리 4bit 빌드로 돌아가긴 한다.
런타임이 달라서 이 셋은 하드웨어 순위가 아니다.
```

## Post 4

```
정확도는 AMI 회의 녹음으로 채점했다. WER 17.88%, 발행 수치 17.20%.

재밌는 건 4bit 쪽이다. 17.47%로 오히려 제일 낮았다.
bf16으로 돌린 두 기기끼리의 차이가 0.22%p였는데, 양자화 손실이 그보다 작았다는 뜻이다.
```

## Post 5

```
한계 하나. "60분 한 번에"는 컨텍스트 이야기지 메모리 이야기가 아니다.

17분 30초에 이미 24GB 카드에서 22GB를 썼다. KV 캐시가 토큰당 57.3KB씩 붙는다.
60분이 이 카드에 들어가는지는 안 재봤고, 안 재본 건 안 적는다.
```

## Post 6

```
6GB 노트북은 양자화해도 못 돌린다.
백본을 nf4로 줄이면 3.65GB인데, 양자화하면 안 되는 모듈이 3.21GB다. 합쳐서 6.86GB.

돌려보지 않고 체크포인트 가중치 인덱스만 읽어도 나오는 계산이다.
```

## Reply to post 1 — posted after the thread

```
예제와 측정값 전부:
https://github.com/<owner>/<repository>/tree/main/examples/showcase/transcribe-long-meeting
```

## What this thread does not say

The model card states the MIT licence and no out-of-scope use, no deployment
restriction and no responsible-AI limitation. There is therefore no usage-scope
quote to carry, and none is invented — silence in the source is not a restriction to
write language for. The thread also stops short of recommending deployment, which is
advice the model's own authors did not give.

Post 3 carries three numbers where the rule allows the first post only one. The rule
binds post 1, which carries one; a later post is where the table belongs, and the
line under it says the three are not a hardware ranking.
