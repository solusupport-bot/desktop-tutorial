# 🔐 Meta API (Threads, Facebook, Instagram) 토큰 발급 완벽 가이드

이 가이드는 **자동 설정 스크립트**를 제공하여 Meta API 토큰 발급 및 설정 과정을 최대한 간소화합니다.

---

## ⚡ 빠른 시작 (5분)

```bash
# 자동 설정 스크립트 실행
npm run setup:meta
```

스크립트가 다음을 자동으로 처리합니다:
1. ✅ Facebook Developers 페이지 안내
2. ✅ 토큰 입력 UI 제공
3. ✅ 토큰 유효성 검사
4. ✅ `.env` 파일에 자동 저장
5. ✅ 설정 확인

---

## 📋 수동 발급 절차 (스크립트가 안 될 때)

### Step 1: Facebook Developers 앱 생성

```
1. https://developers.facebook.com 접속
2. 우측 상단 "My Apps" → "Create App" 클릭
3. 앱 유형: "Business" 선택
4. 앱 이름 입력 (예: "SNS Auto Publisher")
5. 앱 목적: "Automate publishing to social platforms" 선택
```

### Step 2: 필요한 제품 추가

생성된 앱 대시보드에서:

```
[Product] 섹션에서 아래 3개 제품 추가:
✅ Threads API
✅ Facebook 로그인 (비즈니스용)
✅ Instagram Graph API
```

**각 제품 추가 방법:**
1. "+ Add Product" 클릭
2. 해당 제품명 검색
3. "Set Up" 클릭
4. 기본 설정 완료

### Step 3: Facebook 페이지 토큰 발급

#### 3-1) 비즈니스용 Facebook 페이지 생성 (없으면)

```
1. https://www.facebook.com 접속
2. 좌측 하단 "페이지 생성" 클릭
3. 비즈니스 카테고리 선택 (예: "Brand")
4. 페이지 이름 입력
5. 완료
```

#### 3-2) 페이지 액세스 토큰 발급

**방법 A: Graph API 탐색기 (권장)**

```
1. 앱 대시보드 → Tools → Graph API Explorer
2. 우측 상단 "Get Token" → "Page Access Token"
3. 해당 Facebook 페이지 선택
4. 권한 확인 후 토큰 복사
   - 필요 권한: pages_manage_posts, pages_read_engagement
```

**생성된 토큰:**
- `FB_PAGE_ACCESS_TOKEN`: 페이지 ID로 시작하는 긴 문자열
- `FB_PAGE_ID`: 페이지 고유 ID (숫자)

**방법 B: Settings에서 직접 확인**

```
1. Facebook 페이지 설정 → "기본 정보"
2. 페이지 ID 확인
3. Settings → Messenger → Access Tokens → "Generate new token"
```

---

## 📷 Instagram Graph API 연동

### Step 1: Instagram 비즈니스 계정으로 전환

```
1. Instagram 앱 → Settings → Account Type
2. "Professional Account"로 변경 (비즈니스 또는 크리에이터)
3. "Convert to Business Account" 또는 "Convert to Creator Account"
4. 비즈니스 카테고리 선택
5. Facebook 페이지와 연결 (위에서 생성한 페이지 사용)
```

**중요:** Instagram 개인 계정은 API 발행이 불가능합니다!

### Step 2: Instagram 비즈니스 계정 ID 조회

Graph API 탐색기에서:

```bash
# 다음 API 쿼리 실행
GET /{facebook-page-id}?fields=instagram_business_account
```

**응답 예:**
```json
{
  "instagram_business_account": {
    "id": "17841406338180003"  # ← 이것이 IG_USER_ID
  },
  "id": "12345678901234"
}
```

### Step 3: Instagram 액세스 토큰 발급

```
1. Graph API Explorer에서
2. 우측 상단 "Get Token" → "User Access Token"
3. 권한 확인:
   - instagram_basic
   - instagram_manage_messages
   - instagram_graph_user_profile
4. 토큰 복사
```

**생성된 변수:**
- `IG_USER_ID`: Instagram 비즈니스 계정 ID
- `IG_ACCESS_TOKEN`: 사용자 액세스 토큰

---

## 🧵 Threads API 토큰 발급

### Step 1: Threads API 권한 신청

```
1. 앱 대시보드 → "Threads API" → "설정"
2. "권한 요청" 버튼 클릭
3. 비즈니스 목적 설명:
   - "SNS 트렌드 자동화 큐레이션"
   - "정기적인 콘텐츠 발행 자동화"
4. 제출
```

**심사 기간:** 보통 24-48시간

### Step 2: Threads 계정 연결

```
1. Threads 앱에서 비즈니스 계정으로 로그인
2. Settings → Linked accounts
3. Meta Business 계정 선택 및 연결
4. 권한 승인
```

### Step 3: Threads 토큰 발급

**Graph API 탐색기에서:**

```bash
# 1) Threads 비즈니스 계정 ID 조회
GET /{instagram-user-id}?fields=threads_profile_context

# 응답:
{
  "threads_profile_context": {
    "threads_user_id": "......"  # ← 이것이 THREADS_USER_ID
  }
}

# 2) Threads 토큰 발급
GET /me?fields=access_token
```

**생성된 변수:**
- `THREADS_ACCESS_TOKEN`: Threads 공식 API 토큰
- `THREADS_USER_ID`: Threads 계정 고유 ID

---

## ✅ 발급받은 토큰 저장

### 로컬 개발 환경

```bash
# 자동 저장
npm run setup:meta

# 수동 저장: 아래를 .env 파일에 추가
cat >> .env << EOF
FB_PAGE_ACCESS_TOKEN=your_fb_page_token_here
FB_PAGE_ID=your_page_id_here
IG_ACCESS_TOKEN=your_ig_token_here
IG_USER_ID=your_ig_user_id_here
THREADS_ACCESS_TOKEN=your_threads_token_here
THREADS_USER_ID=your_threads_user_id_here
EOF
```

### GitHub Actions (자동 배포용)

```bash
# 1. 저장소 Settings 열기
npm run setup:meta:github

# 2. 또는 수동으로:
# https://github.com/solusupport-bot/desktop-tutorial/settings/secrets/actions

# 3. 다음 Secrets 추가:
# - FB_PAGE_ACCESS_TOKEN
# - FB_PAGE_ID
# - IG_ACCESS_TOKEN
# - IG_USER_ID
# - THREADS_ACCESS_TOKEN
# - THREADS_USER_ID
```

---

## 🧪 토큰 테스트

### 로컬 테스트

```bash
# 토큰 유효성 검사 (자동)
npm run setup:meta          # 스크립트 실행 중 검사 수행

# 수동 테스트
node -e "
require('dotenv').config();
console.log('Tokens loaded:');
['FB_PAGE_ACCESS_TOKEN', 'THREADS_ACCESS_TOKEN', 'IG_ACCESS_TOKEN'].forEach(key => {
  const val = process.env[key];
  if (val) console.log('✅', key);
  else console.log('❌', key);
});
"
```

### 토큰 권한 확인

```bash
# Graph API 탐색기에서:
GET /me/permissions

# 또는 cURL:
curl -G \
  -d "access_token=<ACCESS_TOKEN>" \
  https://graph.instagram.com/me/permissions
```

---

## ⚠️ 주의사항

### 계정 타입
- ✅ Instagram **비즈니스** 또는 **크리에이터** 계정만 지원
- ❌ Instagram 개인 계정은 API 발행 불가능
- ✅ Facebook 페이지는 비즈니스 카테고리 권장

### 보안
- 🔒 절대 토큰을 public repository에 commit하지 마세요
- 🔒 `.env` 파일은 `.gitignore`에 포함되어 있습니다
- 🔒 GitHub Actions Secrets은 암호화되어 저장됩니다
- 🔒 노출된 토큰은 즉시 재생성하세요

### 토큰 갱신
```bash
# 토큰은 유효기간이 있습니다 (보통 60일)
# 정기적으로 (월 1회) 토큰을 갱신하세요
npm run setup:meta
```

### 플랫폼별 주의사항

**Threads:**
- 앱이 개발 또는 테스트 모드일 때는 제한된 사용자만 사용 가능
- 프로덕션 배포 시 "Go Live" 필요

**Instagram:**
- 비즈니스 계정에서만 API 발행 가능
- 개인용 계정으로의 변경 불가능

**Facebook:**
- 페이지 관리자 권한 필수
- 토큰은 특정 페이지에만 유효

---

## 🆘 문제 해결

### 토큰 발급이 안 될 때

**증상 1: "This token is not valid"**
```
→ 토큰 다시 생성하기
→ 권한 확인 (pages_manage_posts 등)
→ 앱 검수 상태 확인
```

**증상 2: "Permission denied"**
```
→ 페이지 관리자 권한 확인
→ 비즈니스 계정으로 로그인했는지 확인
→ Instagram은 비즈니스/크리에이터 계정인지 확인
```

**증상 3: "Threads API not available"**
```
→ 앱 검수 승인 대기 중일 수 있음 (24-48시간)
→ 앱 대시보드에서 "Threads API" → "Status" 확인
```

### 토큰이 자주 만료될 때

```bash
# 장기간 유효한 토큰 발급
# Graph API 탐색기에서:
GET /oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<YOUR_TOKEN>

# 또는 스크립트 사용:
npm run setup:meta      # 정기적으로 갱신
```

---

## 📞 추가 자료

- **Facebook Developers**: https://developers.facebook.com
- **Threads API 문서**: https://developers.facebook.com/docs/threads
- **Instagram Graph API**: https://developers.facebook.com/docs/instagram-api
- **Graph API 탐색기**: https://developers.facebook.com/tools/explorer
- **Meta 앱 검수 가이드**: https://www.facebook.com/policies/apps/

---

## 🎯 최종 체크리스트

- [ ] Facebook Developers 앱 생성 완료
- [ ] Threads API, Facebook Login, Instagram Graph API 추가
- [ ] Facebook 페이지 생성 및 연결 완료
- [ ] Instagram 비즈니스 계정으로 전환 완료
- [ ] 3개 토큰 발급 완료:
  - [ ] `FB_PAGE_ACCESS_TOKEN`
  - [ ] `THREADS_ACCESS_TOKEN`
  - [ ] `IG_ACCESS_TOKEN` (선택)
- [ ] `npm run setup:meta` 실행하여 `.env` 저장 완료
- [ ] GitHub Actions Secrets 등록 완료
- [ ] `npm run curate-and-schedule` 로컬 테스트 성공
- [ ] GitHub Actions 워크플로우 활성화 완료

완료되면 SNS 자동 발행이 본격 시작됩니다! 🚀
