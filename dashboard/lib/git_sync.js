// GitHub Actions 워커(scheduler.yml/daily-topic.yml)는 원격 브랜치만 본다 — 대시보드가
// 로컬 JSON을 고쳐도 push하지 않으면 검수/검증 게이트가 원격에서 무의미해진다.
// 그래서 모든 쓰기 동작은 pull --rebase -> mutate(파일 쓰기) -> add/commit/push 순서를
// 이 한 곳에서만, 그 계정(account.repoPath)의 저장소에 대해 수행한다. push 거부
// (non-fast-forward) 시 force-push는 절대 하지 않고 에러를 그대로 올려 사용자가
// 직접 재시도하게 한다 — run.js의 "push 실패는 안전한 정지 지점" 철학과 동일.
const { execFileSync } = require('child_process');

const BRANCH = 'main';

const git = (account, args) => execFileSync('git', args, { cwd: account.repoPath, encoding: 'utf8' });

/**
 * mutate()는 pull 이후 최신 파일을 직접 읽고/고치고/써야 한다(호출부 책임) —
 * 그래야 원격에 먼저 반영된 변경과 충돌 없이 최신 상태 위에 쓰게 된다.
 * filePaths는 그 계정 저장소 루트 기준 상대경로 배열.
 */
const syncAndCommit = (account, filePaths, message, mutate) => {
  git(account, ['pull', '--rebase', 'origin', BRANCH]);

  mutate();

  git(account, ['add', ...filePaths]);

  const status = git(account, ['status', '--porcelain', ...filePaths]);
  if (!status.trim()) {
    return { committed: false };
  }

  git(account, ['commit', '-m', message]);

  try {
    git(account, ['push', 'origin', BRANCH]);
  } catch (err) {
    throw new Error(`git push 실패(원격에 새 커밋이 있을 수 있음) — 직접 'git pull --rebase && git push'로 재시도하세요: ${err.message}`);
  }

  return { committed: true };
};

module.exports = { syncAndCommit };
