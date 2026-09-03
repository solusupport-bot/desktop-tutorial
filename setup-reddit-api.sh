#!/bin/bash

# setup-reddit-api.sh - Reddit API 토큰 자동 설정 스크립트
# 사용법: ./setup-reddit-api.sh

set -e

echo "🔐 Reddit API 토큰 설정 가이드"
echo "================================"
echo ""
echo "✅ Step 1: https://www.reddit.com/prefs/apps 접속"
echo "   (Reddit 계정으로 로그인하세요)"
echo ""
echo "✅ Step 2: 페이지 하단의 'create an app' 또는 'create another app' 클릭"
echo ""
echo "✅ Step 3: 아래 정보 입력:"
echo "   - Name: Land in Korea SNS Automation (아무거나 가능)"
echo "   - App type: script (선택 필수)"
echo "   - Description: Korea travel blog SNS automation"
echo "   - Redirect URI: http://localhost:8080"
echo ""
echo "✅ Step 4: 'Create app' 클릭 후 생성된 정보 복사:"
echo ""

read -p "Client ID (id 라벨 아래 표시): " CLIENT_ID
read -p "Client Secret (secret 라벨 아래 표시): " CLIENT_SECRET
read -p "Reddit Username (로그인한 계정명): " REDDIT_USERNAME
read -sp "Reddit Password (비밀번호, 화면에 표시 안 됨): " REDDIT_PASSWORD
echo ""
echo ""

# 입력값 검증
if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ] || [ -z "$REDDIT_USERNAME" ] || [ -z "$REDDIT_PASSWORD" ]; then
  echo "❌ 모든 필드를 입력해야 합니다."
  exit 1
fi

# .env 파일 확인/생성
if [ ! -f .env ]; then
  echo "📝 .env 파일 생성 중..."
  cp .env.example .env
fi

# 기존 Reddit 설정 제거
sed -i '' '/^REDDIT_/d' .env 2>/dev/null || sed -i '/^REDDIT_/d' .env 2>/dev/null || true

# 새 설정 추가
cat >> .env << EOF

# Reddit (자동 발행 API)
REDDIT_CLIENT_ID=$CLIENT_ID
REDDIT_CLIENT_SECRET=$CLIENT_SECRET
REDDIT_USERNAME=$REDDIT_USERNAME
REDDIT_PASSWORD=$REDDIT_PASSWORD
EOF

echo "✅ .env 파일 업데이트 완료!"
echo ""
echo "📋 저장된 설정:"
echo "   REDDIT_CLIENT_ID: ${CLIENT_ID:0:10}..."
echo "   REDDIT_USERNAME: $REDDIT_USERNAME"
echo ""
echo "🚀 이제 Reddit 포스트를 발행할 준비가 되었습니다!"
echo ""
echo "발행 명령:"
echo "   npm run publish:reddit                 # 모든 포스트 발행"
echo "   npm run publish:reddit korea-arrival   # 특정 포스트만 발행"
