# GitHub Secrets 설정 가이드

## 현재 상태
✅ SNS 플랫폼 인증 정보가 `.env` 파일에 준비됨  
✅ 워크플로 파일들이 GitHub Secrets를 사용하도록 설정됨  
⚠️ GitHub Actions API가 프록시 제약으로 자동 설정 불가능

## 옵션 1: 스크립트로 자동 설정 (권장)

`GITHUB_TOKEN`이 있다면 다음 명령어로 모든 Secrets을 한 번에 설정할 수 있습니다:

```bash
# GitHub Personal Access Token 설정
# (repo, admin:repo_hook 권한이 필요함)
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx

# 스크립트 실행
node scripts/setup-github-secrets.js
```

**토큰 발급 방법:**
1. https://github.com/settings/tokens/new
2. 다음 권한 선택:
   - `repo` (전체)
   - `admin:repo_hook`
3. 토큰 복사 후 위의 명령어에 입력

## 옵션 2: 웹 UI로 수동 설정 (빠름)

https://github.com/solusupport-bot/desktop-tutorial/settings/secrets/actions 에서 다음 9개 Secret을 추가:

```
BLUESKY_IDENTIFIER=landinkorea.bsky.social
BLUESKY_APP_PASSWORD=ykya-di6r-qpsc-kx7r
MASTODON_INSTANCE=https://mastodon.social
MASTODON_ACCESS_TOKEN=e-FFGbcXUFHi9iAaSETsqHj5x4C3vVfkpyH6U8MS51A
TUMBLR_CONSUMER_KEY=ZeFzPiAG30Z1qbseFTgyi3pJ0L16n932MsmtAMYsUoXRByo3TH
TUMBLR_CONSUMER_SECRET=uTFRZCXfsrnn5Yxf2XfAcO1orweDOnF41m9CBOyWVn34ZlERFN
TUMBLR_TOKEN=TERA3RkhGbJw41ZNEEiCfUGmhkBExJXL0MAb4ek7glzsrKEjlL
TUMBLR_TOKEN_SECRET=mSXOqW2XvexXcQWkCzMJliq9MKrgw0M7ZP6hWiYtmn5Dx9p3F0
TUMBLR_BLOG_IDENTIFIER=landinkorea
```

## 옵션 3: 로컬 환경에서 테스트

`.env` 파일이 이미 준비되어 있으므로 로컬에서 다음과 같이 테스트할 수 있습니다:

```bash
# 로컬 환경 변수 로드
source .env

# Bluesky API 테스트
npm run test:bluesky

# Mastodon API 테스트
npm run test:mastodon

# Tumblr API 테스트
npm run test:tumblr
```

## Secrets 설정 후 다음 단계

1. 워크플로 실행 확인:
   https://github.com/solusupport-bot/desktop-tutorial/actions

2. `test-open-channel-publish.yml` 수동 실행하여 SNS 플랫폼별 발행 테스트:
   - Actions → Test: Open Channel Publish → Run workflow

3. 실제 발행은 다음 스케줄에 따라 자동으로 진행됨:
   - **매일 00:07 UTC** (KST 09:07): `daily-topic.yml` (주제 선정 + 이미지 + 캡션 생성)
   - **매 15분마다**: `scheduler.yml` (큐 검사 → SNS 발행)
