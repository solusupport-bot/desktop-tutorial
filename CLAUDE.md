# CLAUDE.md — 프로젝트 작업 규칙

이 파일은 Claude Code / Cowork 등 모든 세션에서 이 저장소 작업 시 **자동으로 적용되는 규칙**입니다. 사용자가 별도로 지시하지 않아도 아래 규칙을 무조건 따르세요.

---

## 🌐 SNS 콘텐츠 작성 시 Agent Reach 필수 사용 규칙

**이 저장소는 Threads/Facebook/Instagram SNS 자동 발행 파이프라인입니다.**
SNS 게시물 본문 작성, 트렌드 조사, 콘텐츠 큐레이션, 벤치마킹과 관련된 작업을 할 때는
**사용자가 명시적으로 요청하지 않아도 무조건 Agent Reach를 사용**해서 실제 인터넷 정보를 조사한 뒤 작성하세요.

### 적용 대상 (예외 없음)
- SNS 게시물(Threads/Facebook/Instagram) 본문을 새로 작성할 때
- 트렌드 조사, 경쟁사/타 계정 벤치마킹을 할 때
- 콘텐츠 아이디어나 소재를 찾아야 할 때
- 위 작업을 Claude Code 세션에서 하든, Cowork 세션에서 하든 **동일하게 적용**

### 왜 필요한가
- Claude 학습 데이터만으로 작성하면 오래되거나 부정확한 정보가 섞일 수 있음
- Agent Reach를 통해 실제 최신 데이터(YouTube 자막, GitHub, RSS, 웹페이지, Bilibili 등)를 조회해야
  근거 있는(hallucination 없는) 콘텐츠를 만들 수 있음

### 사용 방법

Agent Reach는 `~/.agent-reach-venv`에 설치되어 있습니다 (Panniantong/Agent-Reach 버전).
작업 전에 반드시 활성화하세요:

```bash
source ~/.agent-reach-venv/bin/activate
```

활성화 후 사용 가능한 명령어 (설치 안 되어 있으면 먼저 `bash benchmark.sh` 또는
`npm run benchmark:setup` 실행):

```bash
# 채널 상태 확인 (작업 시작 전 항상 먼저 실행)
agent-reach doctor

# YouTube 영상/자막 조사
yt-dlp --write-auto-subs [URL]

# 웹페이지 읽기 (경쟁 계정, 참고 아티클 등)
curl https://r.jina.ai/[URL]

# GitHub 저장소/이슈 조사
gh search repos --language python
gh api repos/{owner}/{repo}

# RSS 피드 구독 정보
# (agent-reach의 RSS 채널 활용)

# Bilibili 검색 (참고용 트렌드 조사)
bili-cli search '키워드'
```

추가 채널(Twitter/X, Reddit, Facebook, Instagram, 小红书 등)이 필요하면:
```bash
agent-reach install --env=auto --system --channels=<channel_name>
```

### 작업 순서 (SNS 콘텐츠 작성 시 필수 체크리스트)

1. `source ~/.agent-reach-venv/bin/activate` 로 Agent Reach 활성화
2. `agent-reach doctor` 로 사용 가능한 채널 확인
3. 활성화된 채널을 이용해 실제 데이터 조사 (트렌드, 참고 자료, 벤치마킹 대상)
4. 조사한 실제 데이터를 근거로 SNS 게시물 본문 작성
5. 최종 결과물을 `output/` 또는 관련 스크립트 워크플로우에 반영

**이 순서를 생략하고 바로 콘텐츠를 창작하지 마세요.** 사용자가 "Agent Reach 써서" 라고 말하지 않아도 위 규칙은 항상 적용됩니다.

---

## 📁 프로젝트 구조 참고

- `scripts/ingest.js` — API 기반 트렌드 수집 (Apify 등, 선택적)
- `scripts/curate-and-schedule.js` — 콘텐츠 큐레이션 및 예약 발행
- `lib/ingestion/` — 플랫폼별 수집 모듈
- `lib/publishing/` — Meta API 발행 모듈
- `benchmark.sh` / `npm run benchmark` — Agent Reach 자동 통합 벤치마킹 스크립트
- `setup-meta-api.sh` / `setup-meta-api.ps1` — Meta API 토큰 발급 자동화 스크립트 (Mac/Linux, Windows)
- `META_API_SETUP.md` — Meta API 토큰 발급 상세 가이드

## 🔐 Meta API 토큰

- Threads/Facebook/Instagram 발행에는 각각 별도 토큰이 필요합니다 (`META_API_SETUP.md` 참고)
- 토큰은 `.env`에 저장하며, git에 커밋하지 않습니다 (`.gitignore`에 포함됨)
