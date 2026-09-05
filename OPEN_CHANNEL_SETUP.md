# 승인 절차 없는 채널 등록 가이드 (Bluesky / Mastodon)

이 파이프라인의 기존 채널은 전부 플랫폼 심사를 통과해야 발행이 된다 —
Threads/Facebook/Instagram은 Meta 앱 심사, Pinterest는 Standard 액세스 승인.
**Bluesky와 Mastodon은 그 단계가 아예 없다.** 계정을 만들고 토큰을 발급받으면
그 자리에서 발행이 된다.

두 채널을 고른 이유는 승인이 없다는 것 외에 하나 더 있다: **본문 링크에 도달
페널티가 없다.** Threads는 본문에 URL을 넣으면 그 게시물 도달이 억제돼서 지금
"링크는 bio에"로 우회하고 있고(`scripts/daily-auto-post.js` 주석 참고), Instagram도
같다. Bluesky/Mastodon은 Pinterest처럼 글 주소를 본문에 그대로 넣을 수 있어
블로그 유입 마찰이 가장 적은 축에 속한다.

---

## 1. Bluesky

### 계정 + 앱 비밀번호 발급 (5분)

1. https://bsky.app 에서 계정 생성 — 초대 코드는 더 이상 필요 없다.
2. 핸들을 정한다. 기본값은 `이름.bsky.social` 형태이고, 나중에 도메인을
   핸들로 쓸 수도 있다(`@landinkorea.com` — 도메인 소유자면 무료, DNS TXT 레코드
   하나만 추가하면 된다. 브랜드 신뢰도에 도움이 되니 나중에라도 권장).
3. **Settings → Privacy and security → App passwords → Add App Password**
4. 이름을 아무거나 지정하고(예: `land-in-korea-pipeline`) 생성하면
   `xxxx-xxxx-xxxx-xxxx` 형태의 비밀번호가 한 번만 표시된다 — 복사해 둔다.

> ⚠️ 계정 로그인 비밀번호를 그대로 쓰지 말 것. 앱 비밀번호는 언제든 개별
> 폐기할 수 있고, DM 접근 권한이 없어서 유출 시 피해 범위가 훨씬 작다.

### GitHub Secrets 등록

`Settings → Secrets and variables → Actions`에서:

| 이름 | 값 |
|---|---|
| `BLUESKY_IDENTIFIER` | 핸들 (예: `landinkorea.bsky.social`) — `@` 없이 |
| `BLUESKY_APP_PASSWORD` | 위에서 받은 `xxxx-xxxx-xxxx-xxxx` |

`BLUESKY_SERVICE`는 선택이다 — 자체 PDS를 쓰지 않으면 넣지 않아도
`https://bsky.social`이 기본값으로 쓰인다.

---

## 2. Mastodon

### 인스턴스 선택

Mastodon은 단일 서비스가 아니라 서로 연합된 서버들의 네트워크다. 어느 인스턴스에
가입하든 다른 인스턴스 사용자가 팔로우/발견할 수 있으므로, 가입한 곳의 주제와
규칙만 맞으면 된다. 여행 콘텐츠라면 무난한 선택지:

- `mastodon.social` — 가장 큼, 범용. 무난한 기본값.
- `mstdn.social` — 범용, 가입 승인 빠름.
- 여행 특화 인스턴스도 있지만 규모가 작아 굳이 필요하지 않다.

> ⚠️ 인스턴스 규칙(Server rules)을 가입 전에 반드시 읽을 것. 상당수 인스턴스가
> **자동화 계정과 마케팅성 반복 게시를 명시적으로 금지**한다. 규칙에서 봇/자동
> 게시를 금지하는 곳에 자동 발행을 붙이면 계정이 정지된다. 자동화를 허용하는
> 인스턴스를 고르고, 프로필에 자동 게시임을 밝히는 편이 안전하다 —
> Mastodon 문화상 이건 감점이 아니라 오히려 가점이다.

### 액세스 토큰 발급 (3분)

1. 인스턴스에 가입하고 이메일 인증까지 완료한다.
2. **Preferences(설정) → Development(개발) → New application(새 애플리케이션)**
3. 이름: `Land in Korea pipeline` (아무거나)
4. **Scopes(권한)**: `write:statuses`와 `write:media`만 체크한다.
   기본으로 `read`까지 다 켜져 있는데, 발행에는 필요 없으니 꺼두는 게 낫다.
5. 저장하면 상세 화면에 **"Your access token"** 이 표시된다 — 복사해 둔다.

### GitHub Secrets 등록

| 이름 | 값 |
|---|---|
| `MASTODON_INSTANCE` | 인스턴스 주소 (예: `https://mastodon.social`) — 끝에 `/` 없이 |
| `MASTODON_ACCESS_TOKEN` | 위에서 받은 액세스 토큰 |

---

## 3. 동작 확인

시크릿 등록 후 GitHub Actions에서 **"Test Open Channel Publish (Bluesky / Mastodon)"**
워크플로우를 `Run workflow`로 실행한다.

- 자격증명이 있는 채널은 실제로 테스트 게시물을 올리고 URL을 출력한다.
- 자격증명이 없는 채널은 모의 발행으로 넘어가고 실패하지 않는다.
- 실패하면 원인은 사실상 오타이거나 권한 범위 부족이다 — Pinterest처럼
  "승인 대기 중이라 안 되는" 경우가 없다.

확인 후 테스트 게시물은 각 앱에서 직접 삭제하면 된다.

---

## 4. 발행 동작 방식

두 채널 모두 기존 Threads 캡션 구조(빈 줄로 구분된 문단)를 그대로 쓴다.

| | Bluesky | Mastodon |
|---|---|---|
| 글자 수 한도 | 300 그래핌 (하드) | 인스턴스 설정값, 보통 500자 (실행 시 조회) |
| 답글 체인 | 최대 5조각 | 최대 5조각 |
| 이미지 | 최대 4장, 장당 2MB | 최대 4장 |
| 블로그 링크 | 마지막 조각에 삽입 + facet으로 클릭 가능 처리 | 마지막 조각에 삽입 |
| 미디어 없을 때 | 텍스트로 발행 | 텍스트로 발행 |

한도를 넘는 문단은 문장 단위로 한 번 더 쪼개고, 그래도 넘치면 자른다.
이미지가 없는 날에도 이 두 채널은 텍스트로 발행되므로, 이미지 수집이 실패한
날에도 발행이 끊기지 않는다.

---

## 5. 아직 붙이지 않은 후보들

같은 기준(승인 절차 없음)으로 검토했지만 이번에 넣지 않은 것들:

| 채널 | 승인 | 넣지 않은 이유 |
|---|---|---|
| **Telegram 채널** | 없음 (BotFather에서 봇 토큰 즉시 발급) | 발견(discovery) 기능이 사실상 없어서 구독자를 따로 모아야 한다 — 노출 확대 목적에는 안 맞고, 나중에 "구독자 대상 채널"이 필요해지면 그때가 적기 |
| **Tumblr** | 앱 등록 즉시 승인 | OAuth 1.0a 서명이 필요해 구현 비용이 위 둘의 몇 배. 여행 태그 트래픽은 아직 살아 있어서 다음 후보로는 유효 |
| **Lemmy** | 없음 | Reddit과 같은 커뮤니티형이라 이미 붙인 Reddit과 성격이 겹치고, 규모가 훨씬 작다 |
| **Nostr** | 없음 (키페어만 생성) | 여행 콘텐츠 독자층이 거의 없다 |
| **Medium** | — | 신규 통합 토큰 발급이 막혀 있다 |

Tumblr가 다음 순번으로 가장 합리적이다.
