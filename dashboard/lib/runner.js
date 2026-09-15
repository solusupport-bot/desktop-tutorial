// "지금 실행" 버튼들이 공유하는 헬퍼 — 기존 스크립트를 그 계정(account.repoPath)에서
// child_process로 그대로 실행하고(로직 재구현 없음) 출력을 메모리에 잠깐 보관해
// 다음 페이지 렌더링에 보여준다. 단일 사용자 로컬 프로세스라 세션 스토어 없이
// 모듈 스코프 변수로 충분하다. 계정별로 결과가 섞이지 않도록 키를 계정 id로 구분한다.
const { execFileSync } = require('child_process');
const path = require('path');

const lastRuns = {};

const runScript = (account, key, scriptRelPath) => {
  const fullKey = `${account.id}:${key}`;
  try {
    const output = execFileSync(process.execPath, [path.join(account.repoPath, scriptRelPath)], {
      cwd: account.repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    lastRuns[fullKey] = { ok: true, output, at: new Date().toISOString() };
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || err.message || '');
    lastRuns[fullKey] = { ok: false, output, at: new Date().toISOString() };
  }
  return lastRuns[fullKey];
};

const getLastRun = (account, key) => lastRuns[`${account.id}:${key}`];

module.exports = { runScript, getLastRun };
