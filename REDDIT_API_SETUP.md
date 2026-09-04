# Reddit API 설정 가이드

Reddit 자동 발행을 활성화하려면 Reddit API를 설정해야 합니다.

## 1단계: Reddit 개발자 앱 등록

1. https://www.reddit.com/prefs/apps 방문
2. "are you a developer? create an app ..." 클릭
3. 앱 정보 입력:
   - **name**: "Land in Korea SNS Automation"
   - **type**: "script" (개인용 스크립트)
   - **redirect uri**: http://localhost:8080 (또는 아무 URL)
4. "create app" 클릭

## 2단계: 인증 정보 수집

앱 생성 후:
- **Client ID**: 앱 이름 아래 표시되는 ID (약 14자)
- **Client Secret**: "secret" 옆의 값

## 3단계: GitHub Actions Secrets 추가

https://github.com/solusupport-bot/desktop-tutorial/settings/secrets/actions

다음 4개 secret을 추가:

| Key | Value |
|-----|-------|
| `REDDIT_CLIENT_ID` | 2단계에서 얻은 Client ID |
| `REDDIT_CLIENT_SECRET` | 2단계에서 얻은 Client Secret |
| `REDDIT_USERNAME` | Reddit 계정명 |
| `REDDIT_PASSWORD` | Reddit 비밀번호 |

## 4단계: Reddit 채널 설정

`data/reddit_config.json`에서 각 주제별 subreddit 매핑을 확인:
- `koreatravel`: 한국 여행 관련 주제
- `expats`: 한국 거주/이민 관련 주제

기본 설정으로도 작동하지만, 특정 주제를 특정 subreddit으로 보내고 싶으면 여기서 수정.

## 5단계: 테스트

GitHub Actions 수동 실행:
```bash
# daily-topic.yml 실행
gh workflow run daily-topic.yml

# scheduler.yml 실행 (발행)
gh workflow run scheduler.yml
```

## 트러블슈팅

### 401 Unauthorized
- Reddit 자격증명(username/password) 재확인
- GitHub Secrets 값 공백 제거

### "Subreddit not found"
- subreddit 이름 오타 확인
- subreddit 존재 여부 확인 (https://reddit.com/r/subreddit_name)

### "You are doing that too much" (Rate limit)
- Reddit은 계정당 분당 발행 제한이 있습니다
- 새 계정일 경우 제한이 더 엄격할 수 있습니다
- 발행 간격을 늘리거나 하루 3개 주제 대신 1-2개로 줄일 수 있습니다

## 참고

- Reddit API는 사용 약관을 준수해야 합니다 (자동화된 댓글 금지 등)
- 자체 콘텐츠만 발행하는 것은 일반적으로 허용됩니다
- 다른 subreddit의 규칙을 반드시 확인하세요
