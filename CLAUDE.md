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

## 📌 Instagram 향후 계획 (꼭 기억할 것)

- Instagram은 아직 자동 발행 대상이 아님 (현재는 Threads + Facebook만 자동 발행).
- **나중에 Instagram을 추가할 때는 카드뉴스(멀티 슬라이드 캐러셀) 형식으로 만들 것** — 단일 이미지 피드 포스트가 아님.
- 레이아웃/디자인 기준은 `CARD_DESIGN_SPEC.md` 참고 (9슬라이드 구조, NAVY/CORAL/GOLD/CREAM/BLUE 팔레트, Space Grotesk/Inter 폰트, 1080×1350 캔버스, 세트당 이미지 최대 3장).
- 이 항목은 사용자가 "꼭 기억해줘"라고 명시적으로 요청한 사항이므로, Instagram 관련 작업을 시작하기 전에 반드시 이 규칙을 먼저 확인할 것.

---

## 📊 상태 확인 시 조회수도 항상 같이 보고할 것

- 사용자가 "오늘 잘 발행됐는지 확인해줘" 등 SNS/블로그 상태를 물어보면, 발행 성공 여부와 함께 **블로그 조회수도 항상 같이 보고**할 것 (사용자가 "앞으로 물어보면 조회수도 같이 알려줘"라고 명시적으로 요청함).
- 조회수는 GoatCounter로 확인 (`land-in-korea-blog/automation/config.json`의 `goatcounter_code` 설정 후 사용 가능 — 무료, 쿠키 없음, goatcounter.com에서 가입).
- `goatcounter_code`가 아직 비어있다면 조회수를 지어내지 말고, "아직 애널리틱스 계정 연결이 안 되어 있다"고 솔직히 말할 것.

---

## 📝 블로그 글 작성 = SNS 게시물과 동일한 기준 (2026-08-30 규칙, 사용자가 명시적으로 지시)

**블로그 글도 SNS 캡션과 완전히 똑같은 원칙을 따른다.** 별도 저장소(`land-in-korea-blog`)라고 예외를 두지 않는다.

- **자동화 실행 중 유료 API 호출 금지**: `daily-topic.yml`의 블로그 글 작성 단계(`scripts/sync-blog-posts.js`)는
  `ANTHROPIC_API_KEY` 없이 돈다. 우선순위는 SNS 캡션과 동일하게 (1) `data/blog_content_queue.json`에
  미리 써둔 글 → (2) 무료 규칙 기반 템플릿(`buildFallbackPost`) 순이다 (`lib/scheduler/prewritten_content.js`
  의 `blogContentQueue` 참고). 새 주제가 추가돼 블로그 글이 필요해지면, Claude Code 세션(API 과금 없는
  경로)에서 미리 써서 큐에 채워두는 걸 SNS 캡션 사전작성과 동일하게 우선한다.
- **사실 근거 원칙도 동일**: "다른 계정 댓글 자동 답장" 규칙(아래 섹션)과 마찬가지로, 블로그 글도
  `lib/ingestion/korea_travel.js`에 있는 실제 facts만 근거로 쓰고 지어내지 않는다.
- 이 규칙은 SNS 자동화 쪽에서 지출 이중화 문제를 해결한 것과 정확히 같은 이유(자동 실행 중 예상 못 한
  API 과금 방지)로 도입됐다 — 앞으로 블로그 파이프라인을 건드릴 때마다 이 기준을 먼저 확인할 것.

---

## 🔧 참고 리소스: Claude Code 플러그인 마켓플레이스

- **`davepoon/buildwithclaude`** (https://github.com/davepoon/buildwithclaude) — Claude Code용 에이전트(117개)·커맨드(175개)·훅(28개)·스킬(26개)·플러그인(51개) 모음 마켓플레이스.
- 이미지·웹앱까지 포함해 용량이 크고 계속 업데이트되는 저장소라, **통째로 복사해서 저장하지 않음** — 대신 필요할 때 `git clone --depth 1 https://github.com/davepoon/buildwithclaude`로 매번 최신 상태를 받아서 씀 (오래된 사본을 안 만드는 게 목적).
- 이 저장소 작업 중 "이런 걸 자동화해주는 에이전트/스킬/커맨드 없나?" 싶은 상황이 오면, 사용자가 먼저 물어보지 않아도 이 마켓플레이스를 clone해서 관련 있는 게 있는지 확인하고 활용할 것 (예: 이번에 `frontend-design-pro`, `agents-design-experience` 플러그인 확인에 사용함).
- 참고: Claude Code 세션 자체에 설치 가능한 공식 플러그인 카탈로그(`ListPlugins`/`SearchPlugins`)와는 별개의 외부 GitHub 마켓플레이스임 — 겹치는 기능이 공식 카탈로그에 이미 있다면 그쪽을 우선 사용.

---

## 💬 다른 계정 게시물 자동 댓글 (2026-08-26 정책 변경)

- 이전에는 "다른 계정 게시물에 대한 자동 댓글/좋아요/리트윗은 구현하지 않는다"는 규칙이었으나,
  사용자가 리스크를 설명받은 뒤 **명시적으로 상시 자동 파이프라인으로 전환하기로 결정**함.
  계정 정지 리스크는 사용자의 계정이고 사용자의 판단이므로 이 결정을 존중함.
- 단, 아래 콘텐츠 안전장치는 정책 변경과 무관하게 계속 유지한다 (계정 리스크와는 별개로 진짜와 가짜를
  구분하는 문제이기 때문):
  - **1인칭으로 "우리가 직접 써봤다/경험했다"는 문장을 지어내지 않는다.** 실제로 발행 파이프라인이
    확인한 사실(`lib/ingestion/korea_travel.js`, `services/comment-auto-reply/app.py`의
    `KNOWLEDGE_BASE`)만 근거로 답하고, 모르면 모른다고 하거나 블로그로 안내한다.
  - 댓글 상대의 언어를 감지해 그 언어로 답한다(예: 베트남어 댓글엔 베트남어로).
  - 진짜 팔로우업 질문으로 끝맺어 대화처럼 보이게 한다(엔게이지먼트 벤치마킹 규칙과 동일한 톤).
- **기술적 제약(구현 전 반드시 확인할 것):** Threads/Meta Graph API가 제3자 앱에 "아무 공개
  게시물이나 키워드로 검색해서 찾기" 기능을 표준으로 제공하는지 확인되지 않았음 — 자사 계정
  게시물의 댓글에 답하는 것과, 임의의 타 계정 게시물을 자동으로 "발견"하는 것은 완전히 다른 문제.
  발견(discovery) 메커니즘이 API로 안 되면, 후보 게시물 링크를 사람이 넣어주고 답글 작성/발행만
  자동화하는 반자동 구조부터 시작할 것 — 안 되는 걸 된다고 하고 넘어가지 말 것.

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
