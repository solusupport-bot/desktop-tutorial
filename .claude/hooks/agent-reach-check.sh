#!/bin/bash
# UserPromptSubmit hook: SNS 콘텐츠 작성/트렌드 조사/벤치마킹 관련 프롬프트가 오면
# agent-reach doctor 결과를 자동으로 컨텍스트에 주입한다.
# (CLAUDE.md의 "Agent Reach 필수 사용 규칙"을 코드 레벨로 강제)

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty')

# SNS 콘텐츠 작업 관련 키워드 (한글 + 영문)
if ! printf '%s' "$PROMPT" | grep -qiE '(sns|threads|thread|facebook|instagram|insta|게시물|게시글|포스팅|포스트|트렌드|벤치마킹|벤치마크|큐레이션|콘텐츠|본문 ?작성|글 ?작성|경쟁 ?계정|타 ?계정)'; then
  exit 0
fi

VENV="$HOME/.agent-reach-venv"

if [ ! -d "$VENV" ]; then
  jq -n '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:"[agent-reach-check hook] Agent Reach 가상환경이 설치되어 있지 않습니다. SNS 콘텐츠/트렌드/벤치마킹 작업 전에 반드시 `bash benchmark.sh` 또는 `npm run benchmark:setup`을 실행해 Agent Reach를 설치·활성화한 뒤 진행하세요. (CLAUDE.md 규칙)"}}'
  exit 0
fi

DOCTOR_OUTPUT=$(source "$VENV/bin/activate" 2>/dev/null && agent-reach doctor 2>&1)

jq -n --arg doctor "$DOCTOR_OUTPUT" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:("[agent-reach-check hook] SNS/트렌드/벤치마킹 관련 요청이 감지되었습니다. CLAUDE.md 규칙에 따라 Agent Reach로 실제 데이터를 조사한 뒤 작성하세요.\n\n현재 agent-reach doctor 결과:\n\n" + $doctor)}}'
