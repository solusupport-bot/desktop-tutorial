# CLAUDE.md — 프로젝트 작업 규칙

이 파일은 Claude Code / Cowork 등 모든 세션에서 이 저장소 작업 시 **자동으로 적용되는 규칙**입니다. 사용자가 별도로 지시하지 않아도 아래 규칙을 무조건 따르세요.

---

## 🇰🇷 다른 나라 사진 금지 + 📑 중복 주제 금지 (2026-10-08 사용자 실측 지적 — "검증하고 실행해줘 규칙이야")

**사진 쪽:** `land-in-korea-blog/automation/fetch_images.py`의 메인 커버 이미지 경로가
`find_korea_photo(..., strict=True)` 없이 호출되고 있어서, 한국 확인(alt 텍스트에
korea/seoul 등 신호) 사진을 못 찾으면 **관련성만으로** 외국 사진을 채택하는 완화
재시도로 조용히 넘어가고 있었다. 이 완화 경로를 완전히 삭제했다(`find_korea_photo`가
이제 Korea-확인 없이는 항상 `None` 반환 → 호출부는 이미지 없이 텍스트만 발행). SNS
쪽(`lib/ingestion/pexels_image.js`)은 2026-09-13에 이미 같은 수정이 돼 있었음 — 블로그
쪽만 빠져 있었다. **이 완화 재시도를 다시 추가하는 방향의 수정은 금지.**

**주제 쪽:** `data/topic_bank.json`에 문구만 줄이거나 바꾼 근접 중복 주제가 5쌍 있었고
(예: "DMZ and JSA tours" vs "DMZ/JSA tours"), 그중 4개는 **블로그에 이미 각각 별도
글로 중복 발행**까지 된 상태였다. 2026-10-02에 이 쌍들을 "철자 불일치"로 오진단해서
검색어만 추가하고 중복 주제 자체는 못 잡았던 것 — 실제로는 내용까지 겹치는 진짜
중복이었다. 5개 중 4개(KTX/SRT, Trash, DMZ/JSA, First-timer) 제거, 1개(Emergency
numbers)는 중복 쪽이 미발행이라 같이 제거. 재발 방지: `scripts/generate-topics.js`가
이제 정확히 같은 문자열뿐 아니라 토큰 Jaccard 유사도로 근접 중복도 걸러낸다
(`lib/ingestion/topic_similarity.js`). 새 주제를 손으로 추가했을 때도
**`node scripts/verify-no-duplicate-topics.js`를 항상 같이 실행**할 것
(`verify-topic-media-alignment.js`와 동일한 자리).

이미 라이브로 발행된 중복 블로그 글 4쌍은 SEO 영향(리다이렉트/병합 여부)이 있어
자동으로 지우지 않았다 — 처리 방법은 사용자 확인 후 진행.

---

## 🖼️ 미디어 3대 원칙 (2026-10-02 사용자 반복 지시 — "제발 규칙으로 만들어서 실수하지 말자")

**사용자가 같은 지적을 여러 번 반복한 뒤 명시적으로 규칙화를 요청함.** 이미지/영상을 다루는
코드를 고칠 때마다 아래 3개를 깨지 않는지 먼저 확인할 것. 셋 다 "완화/예외"를 추가하는 방향의
수정은 전부 금지 — 이 섹션을 고치는 대신 되돌릴 것.

1. **중복 금지** — 같은 사진/영상을 다른 글에 재사용하지 않는다.
   - SNS: `data/topic_state.json`의 `recentImageUrls`/`recentVideoUrls`는 영구 이력이다
     (`lib/scheduler/topic_rotation.js`) — 캡을 씌워서 오래된 기록을 지우지 말 것.
   - `lib/ingestion/topic_images.js`의 `TOPIC_IMAGES`는 **배열**이다(주제당 최후 폴백 후보
     여러 장). `lib/scheduler/queue_topic.js`의 `resolveImages()`가 `recent`에 없는 후보부터
     고른다 — 다시 문자열 1개로 되돌리면 Pexels/Pixabay 후보가 소진될 때마다 "매번 똑같은
     폴백 사진"이 반복되는 버그(2026-10-02 실측: Gyeongbokgung Palace, T-money transit card)가
     재발한다.
   - 블로그(`land-in-korea-blog`): `automation/fetch_images.py`가 기존 포스트 front matter의
     `image:` 값을 전부 모아 같은 URL을 다시 쓰지 않게 한다 — 이 중복 검사를 생략하지 말 것.
2. **키워드(주제)와 반드시 일치** — "한국 사진이면 됨"이 아니라 "그 글 주제와 실제로 맞는
   사진/영상"이어야 한다.
   - 새 주제를 `data/topic_bank.json`에 추가하면 **반드시 동시에**
     `lib/ingestion/pexels_image.js`의 `TOPIC_QUERIES`에 **철자까지 정확히 같은 키**로 전용
     검색어를 추가할 것. 철자가 미묘하게 다르면(예: "DMZ/JSA tours" vs "DMZ and JSA tours")
     매핑이 조용히 빠지고 허술한 폴백 검색어(`"${topic} korea"`)로 떨어진다(2026-10-02 실측 —
     5개 주제가 이 사고로 몇 주간 주제와 안 맞는 사진으로 나갔음).
   - 추가/수정 후 반드시 `node scripts/verify-topic-media-alignment.js` 실행 — 주제명 불일치와
     콘텐츠 각도 수 vs 검색어 수 불일치를 자동으로 잡아준다. 이 스크립트를 느슨하게 고치거나
     건너뛰지 말 것.
   - "한국임을 확인"하는 `KOREA_SIGNAL` alt/태그 체크(`findKoreaPhoto`, `findKoreaVideo`,
     블로그의 `find_korea_photo`)는 국적 오매칭을 막는 것이지 주제 매칭을 보장하지 않는다 —
     둘은 별개의 검증이며 둘 다 필요하다.
3. **저화질 금지** — 원본 해상도가 낮은 소스는 애초에 후보에서 제외한다(다운스케일해서
   보정하지 않는다).
   - 이미지: `MIN_ORIGINAL_WIDTH = 3000`px (`pexels_image.js`, `pixabay_image.js`,
     블로그의 `fetch_images.py`) — 이 값을 낮추지 말 것.
   - 영상: `MIN_VIDEO_WIDTH = 1280`px(720p) 미만은 후보에서 제외한다(`pexels_video.js`,
     `pixabay_video.js`, 2026-10-02 추가 — 그전엔 영상에 최소 해상도 기준이 아예 없었다).
   - 사람이 미리 검증해둔 `data/curated_videos.json`(`lib/ingestion/curated_video.js`)은
     이미 품질 확인된 것으로 간주하고 이 최소 해상도 체크를 적용하지 않는다(의도적 예외).

---

## 📰 블로그는 매일 1편씩, 중복 없이 자동 발행 (2026-09-11 사용자 명시 지시)

**"매일 블로그 글이 중복없이 올라가도록 해줘"** — 이 지시는 영구 규칙입니다.

- `scripts/sync-blog-posts.js`는 `MAX_NEW_POSTS_PER_RUN = 1`로 캡이 걸려 있어, `korea_travel.js`에
  블로그 글 없는 주제가 몇 개가 쌓여 있든 **하루 실행당 딱 1건만** 발행합니다. 이 캡을 없애거나
  늘리지 마세요 — 없애면 새 주제를 여러 개 추가했을 때 하루에 몰아서 나가고 그 다음 며칠은
  하나도 안 나가는 불규칙한 패턴으로 되돌아갑니다.
- 이 스크립트는 `korea_travel.js`(SOURCES)에서 **아직 블로그 글로 안 나간 주제**를 하나씩 꺼내
  씁니다. **"재고" = 주제 수가 아니라 `data/blog_content_queue.json`에 품질 게이트를 통과한 사전
  작성 글이 준비된 주제 수**입니다(2026-09-23 변경). 3건 밑으로 떨어지면 로그에 경고가 뜹니다.
- **발행 전 하드 게이트 2단계 (2026-09-23, 템플릿 폴백 삭제):**
  1. `lib/publishing/blog_quality.js` — 800단어 이상, 제목 50~60자, 설명 120~160자, ## 3개 이상,
     FAQ 정확히 3개, 틀 제목 금지. (SEO_ADSENSE_CHECKLIST.md 기준을 코드로 강제)
  2. 같은 파일의 `checkReviews()` — **독립 검수 2회** (2026-09-23 사용자 지시). 큐 항목의 `reviews`
     배열에 서로 다른 검수자 2명이 `pass:true`로, **현재 내용의 해시(`contentHash`)**와 함께 남긴
     기록이 있어야 한다. 검수 뒤 한 글자라도 고치면 해시가 달라져 재검수가 필요하다.
  - 자동 실행(CI)은 글을 쓰지도, API로 검증하지도 않는다 — Claude/GPT 호출 경로 없음. 글 작성과
    검수는 Claude Code 세션에서 한다: 작성 → 검수자 A(사실 확인, 웹 출처 대조) + 검수자 B(품질·기존 글
    중복), 둘 다 작성자보다 상위 모델(Fable) 서브에이전트 → 둘 다 통과한 글만 해시를 찍어 큐에 넣는다.
  - 어느 하나라도 불합격이면 그 주제는 건너뛰고, 하루 발행 0건이면 워크플로가 빨간불이 된다. 배경:
    Anthropic 크레딧 소진으로 Claude 생성이 실패하자 템플릿 폴백이 237~290단어 글을 매일 "성공"으로
    발행했음. **폴백 경로를 다시 만들지 말 것** — 얇은 글 1편보다 발행 안 한 하루가 애드센스에 덜 해롭다.
  - 게이트 자체 테스트: `node lib/publishing/blog_quality.check.js`
  - 제목에 콜론(:) 금지 — `buildMarkdown`이 ` -`로 바꿔 어색해진다. 내부 링크는
    `https://landinkorea.com/posts/<실제 존재하는 slug>.html` 절대경로로.
- **재고가 3건 이하로 떨어진 걸 발견하면, 사용자에게 물어보지 말고 그 자리에서 바로 새 주제를
  써서 채울 것** (2026-09-11 사용자 명시 지시: "재고 3건이하로 떨어지면 너가 물어보지말고 그냥
  발행해서 채워"). "다음에 할까요?", "몇 개 추가할까요?" 같은 확인 질문 없이 바로 진행 — 이건
  이미 승인된 반복 작업이지 매번 새로 허락받아야 하는 일이 아니다. 한 번에 5~10개 정도 추가해
  당분간(며칠~1주 이상) 재고를 확보해두는 것을 기본으로 한다.
- 새 주제 추가 시 각 주제는 반드시: (1) 실제 사실 기반 콘텐츠 2개 각도(content 배열, 지어내지
  않고 검증 가능한 에버그린 정보만), (2) `lib/ingestion/pexels_image.js`의 `TOPIC_QUERIES`에
  동일한 순서로 이미지 검색어 2개(콘텐츠 각도와 1:1 대응, 한국 신호 포함)를 함께 추가해야 합니다
  — 둘 중 하나만 추가하면 `scripts/verify-topic-media-alignment.js`가 정렬 불일치로 잡아냅니다.
  추가 후 `node scripts/verify-topic-media-alignment.js`로 검증할 것.
- **시즌 주제 (2026-09-24 사용자 지시: "추석이니까 추석 문구, 그달 행사를 찾아서 주제 선정")**:
  주제를 채울 때마다 이번 달·다음 달 명절/축제를 웹에서 확인해(날짜는 매년 바뀜 — 예: 2026 서울
  불꽃축제는 9/5로 당겨짐) 해당 주제를 `topic_bank.json`에 `season: { "from": "YYYY-MM-DD",
  "to": "YYYY-MM-DD" }`(KST)와 함께 추가한다. 기간 안에서는 가장 먼저 뽑히고 기간 밖이면 로테이션에서
  빠진다(`topic_rotation.js`의 `rankByLeastRecentlyUsed`). 명절 캡션에는 인사말(예: "Chuseok jal
  bonaeseyo")을 넣는다. 주제를 끼워 넣으면 이후 seed가 밀리므로 `sns_content_queue.json`의 미래
  캡션을 주제 기준으로 새 seed에 다시 붙여야 한다(안 하면 캐시가 전부 불일치로 버려진다).
- **새 주제를 쓰기 전에 반드시 기존 23~31개 주제(`korea_travel.js`의 `SOURCES` 전체)와
  land-in-korea-blog에 이미 있는 글 제목/내용을 확인해서 겹치는 소재가 없는지 확인할 것**
  (2026-09-11 사용자 명시 지시: "중복사항이 있는지 확인하고 중복이 되지 않도록 작성"). 예:
  이미 "Namdaemun Market"이 있으면 "남대문시장 쇼핑 팁" 같은 걸 별도 주제로 또 만들지 않기,
  이미 "Convenience store hacks"가 있으면 편의점 관련 다른 각도의 주제를 새로 추가하기 전에
  기존 글과 실질적으로 다른 소재인지 판단할 것. 완전히 다른 장소/사물/제도를 다루는 주제만
  새로 추가하고, 애매하면 기존 주제의 `content` 배열에 각도를 하나 더 추가하는 쪽을 우선한다
  (단, 이 경우 이미 발행된 기존 블로그 글은 수정하지 않고, 그 주제가 앞으로 SNS에 다시
  뽑힐 때 새 각도가 반영되는 정도로만 활용됨 — 블로그 글 자체를 늘리려면 결국 새 topic 항목이
  필요함).
- 새 주제를 추가한 뒤에는 **`data/topic_blog_links.json`을 절대 직접 수동으로 편집해 슬러그를
  미리 채워넣지 말 것** — sync-blog-posts.js가 다음 실행에서 자동으로 새 글을 쓰고 슬러그를
  기록합니다. 미리 채워넣으면 "이미 블로그 글 있음"으로 착각해 영원히 안 써집니다.
- **이 저장소(desktop-tutorial)에서 코드를 고칠 때는 반드시 main 브랜치에도 반영이 되는지
  확인할 것.** 실제 자동화(daily-topic.yml, scheduler.yml)는 전부 main 브랜치에서 실행되므로,
  feature 브랜치에서만 고치고 main에 병합을 안 하면 "고쳤다"고 보고해도 실제로는 아무것도
  달라지지 않습니다(2026-09-11 실측 — 이 실수로 며칠간 수정사항이 반영 안 된 채 방치됨).

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

- **글 공급 경로는 하나뿐**: `data/blog_content_queue.json`에 Claude Code 세션(API 과금 없는 경로)에서
  미리 써서 검수 2회를 통과시킨 글. CI의 Claude 실시간 작성·GPT 검증·템플릿 폴백은 2026-09-23 전부
  삭제됨(위 📰 섹션 하드 게이트 참고).
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

## 🎛️ 플랫폼별 발행 형식 (2026-09-01 사용자 실측 피드백 반영, 사용자가 명시적으로 지시)

실제 계정 성과와 벤치마킹 스크린샷을 본 뒤 사용자가 지시한 현재 기준. 이후 세션에서
이 파이프라인을 건드릴 때 기본값으로 삼을 것 — 되돌리지 말고, 바꾸려면 새 지시를 받을 것.

- **Facebook = 이미지 앨범 고정.** 한동안 영상(Reels)을 우선했지만 실제 반응은 이미지가
  더 좋았음 — 이론적 수치보다 실측을 우선한다. (`scripts/daily-auto-post.js`의
  `mediaByPlatform.facebook`)
- **Instagram = 영상(Reels) 우선 + 주제에 맞는 배경음악.** Openverse(가입/키 불필요,
  상업적 이용+변형 가능 라이선스만)에서 주제 무드에 맞는 곡을 찾아 ffmpeg로 합성 후
  raw.githubusercontent.com으로 호스팅, CC BY 크레딧을 캡션에 자동 추가. 무드 매핑은
  `lib/media/topic_music.js`(관광지 스포트라이트는 시네마틱/앰비언트, 실용 팁은
  경쾌한 여행 브이로그 계열). ffmpeg는 GitHub Actions 기본 이미지에 없어 워크플로에
  명시적 설치 스텝이 필요함(`daily-topic.yml`, `test-curated-publish.yml`).
- **Threads = 훅 + 답글 체인 최대 4개(총 5조각), "1/5" 구조.** 기존엔 훅+답글 1개(2단)
  였으나, 실제 고성과 계정 벤치마킹(스크린샷의 "1/2" 구조)을 참고해 답글을 최대
  4개까지 늘림. `lib/publishing/threads.js`가 본문을 빈 줄(문단) 기준 최대 5조각으로
  나눠 훅=원 게시물, 나머지=이전 답글에 순서대로 이어 다는 답글 체인으로 발행한다.
  `lib/curation/curate.js`의 PLATFORM_GUIDE와 템플릿 폴백 둘 다 이 5문단 구조로
  캡션을 생성하도록 맞춰져 있음 — 새 캡션을 손으로 미리 쓸 때도 이 구조(훅/관찰1/
  관찰2/주의사항/질문, 각각 빈 줄로 구분)를 따를 것.
- **블로그 = 본문 끝에 FAQ(Q&A 3개) 섹션 필수.** 애드센스 승인에 실질적 콘텐츠로
  도움이 된다는 이유. `scripts/sync-blog-posts.js`는 사전 작성 큐 항목에
  `faq` 필드(질문/답변 3쌍)가 없으면 품질 게이트에서 막고, 있으면 "## Frequently Asked
  Questions" 섹션으로 렌더링한다. 새 사실을 지어내지 않고 이미 검증된 본문 내용만
  답변으로 재사용할 것 — land-in-korea-blog 저장소의 기존 20개 글에도 이미 소급 적용됨.

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
