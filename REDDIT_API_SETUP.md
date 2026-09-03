# 🔐 Reddit API 토큰 발급 가이드

Reddit 자동 발행을 위한 API 토큰 발급 절차입니다.

---

## ⚡ 빠른 시작 (5분)

### Step 1: Reddit 개발자 앱 등록

```
1. https://www.reddit.com/prefs/apps 접속
2. 하단 "create an app" 또는 "create another app" 클릭
3. 앱 이름: "Land in Korea SNS Automation" (아무 이름 가능)
4. 앱 타입: "script" 선택 (개인용 스크립트)
5. 설명: "Korea travel blog SNS automation"
6. Redirect URI: "http://localhost:8080" (필수이지만 실제로 사용 안 함)
7. Create app 클릭
```

### Step 2: 토큰 확인

앱 생성 후 화면에서:
- **client_id**: "script" 라벨 아래 표시됨
- **client_secret**: "secret" 값
- **username**: 앱을 만든 Reddit 계정명
- **password**: 해당 계정의 Reddit 비밀번호

### Step 3: .env 파일에 저장

```bash
# .env 에 다음 추가:
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_USERNAME=your_reddit_username_here
REDDIT_PASSWORD=your_reddit_password_here
```

### Step 4: 토큰 테스트

```bash
npm run test:reddit
```

---

## ⚠️ 중요 사항

1. **계정 보안**: Reddit 비밀번호는 절대 GitHub에 커밋하지 않기 (`.gitignore` 확인)
2. **API 이용 약관**: Reddit API 약관 준수 필수
3. **Rate Limiting**: Reddit API는 분당 요청 제한이 있음 (자동화에서 처리됨)
4. **User-Agent**: 모든 요청에 명확한 User-Agent 필수

---

## 🔗 참고 자료

- [Reddit API 문서](https://www.reddit.com/dev/api)
- [Reddit OAuth2 인증](https://github.com/reddit-archive/reddit/wiki/OAuth2)
- [snoowrap 라이브러리](https://github.com/not-an-aardvark/snoowrap) (JavaScript Reddit API Wrapper)
