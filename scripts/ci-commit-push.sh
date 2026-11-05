#!/usr/bin/env bash
# Shared commit+push helper for GitHub Actions steps that write to data/*.json.
# 2026-11-05 실측: daily-topic.yml(하루 1회)과 scheduler.yml(시간당 1회)이 겹치는
# 파일(data/queue.json 등)에 둘 다 커밋한다. 42분짜리 실행이 커밋까지 끝내놓고도
# push가 non-fast-forward로 거부되면(동시에 다른 실행이 먼저 push함) 그 실행이
# 한 작업 전체를 통째로 날렸다 — 재시도가 없었기 때문이다. pull --rebase 후
# 재시도하면 두 실행의 변경사항이 안전하게 합쳐진다(서로 다른 파일/주제를 건드려
# 실제 충돌은 거의 없음).
#
# 주의: data/queue.json "claim" 커밋(발행 소유권 락 역할)에는 이 스크립트를 쓰지
# 않는다 — 그 커밋은 push 거부가 "이미 다른 실행이 처리 중"이라는 신호라서 즉시
# 멈춰야 한다(재시도하면 중복 발행 사고로 이어짐, 2026-09-01 사고 참고).
#
# 사용법: ci-commit-push.sh "<commit message>" <file-or-dir> [file-or-dir...]
set -euo pipefail

message="$1"
shift
paths=("$@")

if git diff --quiet -- "${paths[@]}" && git diff --cached --quiet -- "${paths[@]}"; then
  echo "No changes to commit."
  exit 0
fi

git config user.name "sns-automation-bot"
git config user.email "actions@github.com"
git add "${paths[@]}"
git commit -m "$message"

for attempt in 1 2 3; do
  if git push origin "HEAD:${GITHUB_REF_NAME}"; then
    exit 0
  fi
  echo "Push rejected (attempt ${attempt}/3) -- rebasing onto latest and retrying."
  git pull --rebase origin "${GITHUB_REF_NAME}"
done

echo "::error::Push failed after 3 attempts -- giving up."
exit 1
