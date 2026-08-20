#!/bin/bash
# ============================================================================
# 🚀 Agent Reach Auto-Integration Benchmark Script
# SNS 자동화 프로그램에서 벤치마킹할 때 Agent Reach를 자동으로 적용
# ============================================================================

set -e

# Agent Reach 가상환경 경로
AGENT_REACH_VENV="${HOME}/.agent-reach-venv"

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🌐 Agent Reach 자동 통합 벤치마킹 시작${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

# 1. Agent Reach 가상환경 확인
echo -e "\n${YELLOW}[1/4] Agent Reach 환경 확인 중...${NC}"
if [ ! -d "$AGENT_REACH_VENV" ]; then
    echo "❌ Agent Reach가 설치되지 않았습니다."
    echo "설치 명령: python3 -m venv $AGENT_REACH_VENV && source $AGENT_REACH_VENV/bin/activate && pip install /home/user/panniantong/agent-reach"
    exit 1
fi
echo -e "${GREEN}✅ Agent Reach 가상환경 발견: $AGENT_REACH_VENV${NC}"

# 2. Agent Reach 활성화
echo -e "\n${YELLOW}[2/4] Agent Reach 활성화 중...${NC}"
source "$AGENT_REACH_VENV/bin/activate"
echo -e "${GREEN}✅ Agent Reach 활성화 완료${NC}"

# 3. Agent Reach 상태 확인
echo -e "\n${YELLOW}[3/4] Agent Reach 채널 상태 확인 중...${NC}"
agent-reach doctor --json > /tmp/agent-reach-status.json 2>/dev/null || true
agent-reach doctor
echo -e "${GREEN}✅ 채널 상태 확인 완료${NC}"

# 4. 환경 변수 설정
echo -e "\n${YELLOW}[4/4] 환경 변수 설정 중...${NC}"
export AGENT_REACH_ENABLED=true
export AGENT_REACH_VENV="$AGENT_REACH_VENV"
export AGENT_REACH_STATUS="/tmp/agent-reach-status.json"
echo -e "${GREEN}✅ 환경 변수 설정 완료${NC}"

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Agent Reach 자동 통합 준비 완료!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

echo ""
echo -e "${BLUE}📋 다음 명령어로 SNS 자동화를 시작하세요:${NC}"
echo ""
echo -e "${YELLOW}# 즉시 실행 (스킬 없이):${NC}"
echo "  npm start"
echo ""
echo -e "${YELLOW}# 또는 유료 채널 설정 후:${NC}"
echo "  agent-reach configure twitter-cookies  # Twitter 로그인 쿠키"
echo "  agent-reach configure reddit-cookies   # Reddit 로그인 쿠키"
echo "  npm start"
echo ""

echo -e "${BLUE}📊 활용 가능한 명령어:${NC}"
echo "  yt-dlp --write-auto-subs [URL]        # YouTube 자막 다운로드"
echo "  curl https://r.jina.ai/[URL]          # 웹페이지 읽기"
echo "  gh search repos --language python     # GitHub 검색"
echo "  bili-cli search '키워드'                # B站 검색"
echo ""

# 5. SNS 프로그램 실행 (선택사항)
if [ "$1" == "--run" ]; then
    echo -e "${YELLOW}SNS 자동화 프로그램 시작 중...${NC}"
    npm start
fi
