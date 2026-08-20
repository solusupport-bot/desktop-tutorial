# SNS Auto Publisher (Meta 공식 API 기반)

AI 트렌드를 수집(X/Threads/Hacker News/GitHub) → Gemini로 플랫폼별 게시글로 큐레이션 → **Meta 공식 Graph API**로 Threads/Facebook/Instagram에 예약 발행하는 파이프라인입니다.

기존에 검토했던 [7_threads_auto](https://github.com/nam-ai-trend/7_threads_auto) 프로젝트는 Playwright로 실제 로그인된 브라우저를 조작해 발행하는 방식이라 계정 정지 위험이 있었습니다. 이 프로젝트는 그 대신 **Meta가 공식 승인한 API만 사용**하고, "예약 포스팅"은 공식 API에 없는 기능이라 자체 큐+스케줄러(GitHub Actions cron)로 구현합니다.

## 왜 API 방식인가

- 브라우저 자동화는 사람인 척 로그인 세션을 조작하는 구조라 봇 탐지에 걸리면 계정이 정지될 수 있습니다.
- 공식 Graph API는 메타가 승인한 경로이므로 그런 리스크가 없습니다. 대신 API 자체에 "예약 발행" 기능이 없어서, 이 프로젝트는 직접 만든 큐 + 15분마다 도는 GitHub Actions 스케줄러로 예약을 대체합니다.

## 폴더 구조

```
lib/
  ingestion/       # 트렌드 수집 (X/Threads/오피니언 리더/HN/GitHub) - API 키 없으면 모의 데이터로 대체
  curation/        # Gemini로 플랫폼별(threads/facebook/instagram) 게시글 초안 생성
  publishing/      # 플랫폼별 발행 모듈 (threads.js, facebook.js, instagram.js) + index.js 레지스트리
  scheduler/       # 큐(queue.json) 관리 및 예약 시각 도래분 발행 실행
scripts/
  ingest.js               # 트렌드 수집 실행
  curate-and-schedule.js  # 원문 하나를 큐레이션 후 큐에 등록
  schedule-post.js        # 직접 작성한 텍스트를 큐에 등록
  run-scheduler.js        # 큐에서 예약 시각이 지난 게시글을 발행 (cron이 호출)
.github/workflows/scheduler.yml  # 15분마다 run-scheduler.js를 실행하고 큐 상태를 커밋
data/queue.json          # 예약 게시글 큐 (git에 상태로 커밋됨)
```

## 설치

```bash
npm install
cp .env.example .env
```

## API 키 발급 (Meta)

1. [developers.facebook.com](https://developers.facebook.com)에서 앱 생성
2. 앱에 다음 제품 추가: **Threads API**, **Facebook 로그인(비즈니스용)**, **Instagram Graph API**
3. Facebook 페이지 액세스 토큰 발급 (`FB_PAGE_ACCESS_TOKEN`), 페이지 ID 확인 (`FB_PAGE_ID`)
4. Instagram 비즈니스 계정을 페이지에 연결한 뒤 `/{page-id}?fields=instagram_business_account`로 IG 계정 ID 확인 (`IG_USER_ID`, 토큰은 페이지 토큰 재사용 가능)
5. Threads API 앱 검수 후 `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID` 발급
6. 토큰들을 `.env`(로컬 테스트용) 또는 GitHub 저장소의 **Settings → Secrets and variables → Actions**(자동 실행용)에 등록

> API 키가 없어도 모든 발행 모듈은 콘솔에 "모의 발행" 로그만 남기고 정상 종료됩니다 — 배선 검증용으로 그대로 실행해볼 수 있습니다.

## 사용법

### 1. 트렌드 수집
```bash
npm run ingest
```

### 2. 큐레이션 + 예약 등록
```bash
node scripts/curate-and-schedule.js \
  --content "원문 내용" --source X --author me --url https://... \
  --platforms threads,facebook,instagram \
  --image https://example.com/image.jpg \
  --at 2026-08-21T09:00:00Z
```
`--at`을 생략하면 다음 스케줄러 실행 시 즉시 발행됩니다. Instagram은 `--image` 없이는 발행할 수 없습니다(공식 API 제약).

### 3. 직접 작성한 텍스트 예약
```bash
node scripts/schedule-post.js --text "게시글 본문" --platforms threads,facebook --at 2026-08-21T09:00:00Z
```

### 4. 스케줄러 수동 실행 (평소엔 GitHub Actions가 15분마다 자동 실행)
```bash
npm run run-scheduler
```

## 확장 (TikTok, X 추가 예정)

`lib/publishing/index.js`의 `PLATFORMS` 객체에 `{ publish, requiresMedia }` 형태로 새 플랫폼 모듈을 등록하면 큐/스케줄러 로직 변경 없이 바로 사용할 수 있습니다. TikTok/X는 API 키 발급 후 `lib/publishing/tiktok.js`, `lib/publishing/x.js`를 같은 패턴으로 추가하면 됩니다.
