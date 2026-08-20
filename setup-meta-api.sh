#!/bin/bash
# ============================================================================
# 🔐 Meta API 자동 설정 가이드 (Interactive)
# Facebook Developers에서 토큰 발급받고 자동으로 .env에 저장
# ============================================================================

set -e

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Meta API 정보 저장 파일
META_TOKENS_FILE="/tmp/meta-tokens.json"

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🔐 Meta API 토큰 발급 및 자동 설정${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

# Step 1: 브라우저에서 Meta for Developers 열기
echo -e "\n${YELLOW}[1/5] Meta for Developers 페이지 열기${NC}"
echo -e "${BLUE}아래 URL을 브라우저에서 열어주세요:${NC}"
echo -e "${GREEN}https://developers.facebook.com${NC}"
echo ""
echo -e "${BLUE}로그인 후 우측 상단 'My Apps' → 'Create App' 클릭하세요.${NC}"
read -p "완료했으면 Enter 키를 누르세요: "

# Step 2: 토큰 정보 입력
echo -e "\n${YELLOW}[2/5] 발급받은 토큰 정보 입력${NC}"
echo ""

# Facebook 페이지 액세스 토큰
read -p "FB_PAGE_ACCESS_TOKEN 입력: " FB_PAGE_ACCESS_TOKEN
if [ -z "$FB_PAGE_ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ 토큰이 비어있습니다.${NC}"
    exit 1
fi

# Facebook 페이지 ID
read -p "FB_PAGE_ID 입력: " FB_PAGE_ID
if [ -z "$FB_PAGE_ID" ]; then
    echo -e "${RED}❌ 페이지 ID가 비어있습니다.${NC}"
    exit 1
fi

# Instagram 비즈니스 계정 ID (선택사항)
read -p "IG_USER_ID 입력 (선택, 없으면 Enter): " IG_USER_ID

# Instagram 액세스 토큰 (선택사항)
read -p "IG_ACCESS_TOKEN 입력 (선택, 없으면 Enter): " IG_ACCESS_TOKEN

# Threads 액세스 토큰 (선택사항)
read -p "THREADS_ACCESS_TOKEN 입력 (선택, 없으면 Enter): " THREADS_ACCESS_TOKEN

# Threads 사용자 ID (선택사항)
read -p "THREADS_USER_ID 입력 (선택, 없으면 Enter): " THREADS_USER_ID

# Step 3: 토큰 검증
echo -e "\n${YELLOW}[3/5] 토큰 유효성 검사 중...${NC}"

validate_token() {
    local token=$1
    local token_name=$2

    if [ -z "$token" ]; then
        echo -e "${YELLOW}⊘  $token_name: 건너뜀${NC}"
        return 0
    fi

    # GraphAPI에서 토큰 유효성 검사
    response=$(curl -s "https://graph.instagram.com/me?access_token=$token" 2>/dev/null)

    if echo "$response" | grep -q "error"; then
        echo -e "${RED}❌ $token_name: 유효하지 않음${NC}"
        echo "   응답: $response"
        return 1
    else
        echo -e "${GREEN}✅ $token_name: 유효함${NC}"
        return 0
    fi
}

# 토큰 검증 (선택적)
echo "주의: 인터넷이 느리면 시간이 걸릴 수 있습니다."
read -p "토큰 검증을 수행할까요? (y/n): " validate_choice

if [ "$validate_choice" = "y" ]; then
    validate_token "$FB_PAGE_ACCESS_TOKEN" "FB_PAGE_ACCESS_TOKEN" || true
    [ -n "$IG_ACCESS_TOKEN" ] && validate_token "$IG_ACCESS_TOKEN" "IG_ACCESS_TOKEN" || true
    [ -n "$THREADS_ACCESS_TOKEN" ] && validate_token "$THREADS_ACCESS_TOKEN" "THREADS_ACCESS_TOKEN" || true
fi

# Step 4: .env 파일에 저장
echo -e "\n${YELLOW}[4/5] 토큰을 .env 파일에 저장 중...${NC}"

ENV_FILE=".env"

# 백업 생성
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%s)"
    echo -e "${BLUE}기존 .env 백업: ${ENV_FILE}.backup.*${NC}"
fi

# .env 업데이트 함수
update_env() {
    local key=$1
    local value=$2

    if [ -z "$value" ]; then
        return
    fi

    # 기존 키 제거 및 새로운 값 추가
    grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" 2>/dev/null || true
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
    echo "${key}=${value}" >> "$ENV_FILE"
}

# .env가 없으면 생성
if [ ! -f "$ENV_FILE" ]; then
    touch "$ENV_FILE"
    echo -e "${BLUE}새로운 .env 파일 생성${NC}"
fi

# 토큰 저장
update_env "FB_PAGE_ACCESS_TOKEN" "$FB_PAGE_ACCESS_TOKEN"
update_env "FB_PAGE_ID" "$FB_PAGE_ID"
[ -n "$IG_USER_ID" ] && update_env "IG_USER_ID" "$IG_USER_ID"
[ -n "$IG_ACCESS_TOKEN" ] && update_env "IG_ACCESS_TOKEN" "$IG_ACCESS_TOKEN"
[ -n "$THREADS_ACCESS_TOKEN" ] && update_env "THREADS_ACCESS_TOKEN" "$THREADS_ACCESS_TOKEN"
[ -n "$THREADS_USER_ID" ] && update_env "THREADS_USER_ID" "$THREADS_USER_ID"

echo -e "${GREEN}✅ .env 파일 업데이트 완료${NC}"

# Step 5: 테스트
echo -e "\n${YELLOW}[5/5] 테스트 실행 중...${NC}"

# Node.js 테스트 스크립트 실행
if command -v node &> /dev/null; then
    cat > /tmp/test-meta-api.js << 'EOF'
require('dotenv').config();

const tokens = {
    'THREADS_ACCESS_TOKEN': process.env.THREADS_ACCESS_TOKEN,
    'THREADS_USER_ID': process.env.THREADS_USER_ID,
    'FB_PAGE_ACCESS_TOKEN': process.env.FB_PAGE_ACCESS_TOKEN,
    'FB_PAGE_ID': process.env.FB_PAGE_ID,
    'IG_ACCESS_TOKEN': process.env.IG_ACCESS_TOKEN,
    'IG_USER_ID': process.env.IG_USER_ID,
};

console.log('\n📋 설정된 Meta API 토큰:');
console.log('════════════════════════════════════════════════════════');
Object.entries(tokens).forEach(([key, value]) => {
    if (value) {
        const masked = value.substring(0, 10) + '...' + value.substring(value.length - 5);
        console.log(`✅ ${key}: ${masked}`);
    } else {
        console.log(`⊘  ${key}: 미설정`);
    }
});
console.log('════════════════════════════════════════════════════════\n');
EOF

    node /tmp/test-meta-api.js
else
    echo -e "${YELLOW}⊘  Node.js가 없어 테스트를 스킵합니다.${NC}"
fi

# 최종 요약
echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Meta API 설정 완료!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

echo ""
echo -e "${BLUE}📝 다음 단계:${NC}"
echo ""
echo "1️⃣  로컬 테스트:"
echo "   npm run curate-and-schedule"
echo ""
echo "2️⃣  GitHub Actions에 토큰 등록 (실서비스용):"
echo "   Settings → Secrets and variables → Actions"
echo "   아래 변수들 추가:"
echo "   - THREADS_ACCESS_TOKEN"
echo "   - THREADS_USER_ID"
echo "   - FB_PAGE_ACCESS_TOKEN"
echo "   - FB_PAGE_ID"
echo "   - IG_ACCESS_TOKEN (선택)"
echo "   - IG_USER_ID (선택)"
echo ""
echo "3️⃣  GitHub에서 워크플로우 자동 실행 설정:"
echo "   Settings → Actions → General → Workflow permissions"
echo "   'Read and write' 권한 설정"
echo ""

echo -e "${YELLOW}⚠️  보안 주의:${NC}"
echo "   - .env 파일은 .gitignore에 포함되어 있으므로 git에 올라가지 않습니다"
echo "   - 절대 토큰을 public repository에 commit하지 마세요"
echo "   - 정기적으로 토큰을 갱신하세요"
echo ""
