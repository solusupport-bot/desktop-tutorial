// 대시보드가 읽는 데이터는 전부 cron 스크립트들이 이미 쓰고 있는 그 파일들이다 —
// 별도 DB를 두지 않고, 매 요청마다 fs로 새로 읽는다. 모든 함수는 account
// ({id, repoPath, blogRepoPath} — dashboard/lib/accounts.js)를 받아, 그 계정
// 저장소의 lib/scheduler 모듈을 동적으로 require한다 — 계정별로 다른 저장소를
// 가리키므로 require 경로가 달라져 각자 독립적인 모듈 인스턴스로 캐싱된다.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
};

const queueLib = (account) => require(path.join(account.repoPath, 'lib/scheduler/queue'));
const rotationLib = (account) => require(path.join(account.repoPath, 'lib/scheduler/topic_rotation'));

const getQueue = (account) => queueLib(account).loadQueue();
const getTopicBank = (account) => readJson(path.join(account.repoPath, 'data/topic_bank.json'), []);
const getTopicState = (account) => rotationLib(account).loadState();

// fetchKoreaTravelTopics()와 동일한 매핑이지만, 대시보드 조회용으로 실시간 API를
// 매번 호출할 필요는 없어 정적 주제만 다룬다(예정 미리보기 목적).
const getUpcomingTopicPreview = (account, count = 5) => {
  const topics = getTopicBank(account).map((s) => ({
    source: s.topic, author: s.author, content: s.content, url: s.url,
    category: s.category, placeKeyword: s.placeKeyword
  }));
  return rotationLib(account).peekUpcomingTopics(topics, count);
};

const getPlatformPerformance = (account) => readJson(path.join(account.repoPath, 'data/platform_performance.json'), {});
const getQuestionPerformance = (account) => readJson(path.join(account.repoPath, 'data/question_performance.json'), {});

// 큐 항목을 "같은 실행에서 나온 같은 주제"로 묶는다 — verify-no-duplicate-media.js가
// 쓰는 것과 동일한 규칙(createdAt을 초 단위까지 잘라 같은 인스턴스로 취급).
const groupQueueByBatch = (queue) => {
  const batches = new Map();
  queue.forEach((item) => {
    const key = `${item.topic || item.source || 'unknown'}__${(item.createdAt || '').slice(0, 19)}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(item);
  });
  return [...batches.entries()].map(([key, items]) => ({ key, items }));
};

// 블로그 저장소는 Python(정적 사이트)일 수 있어 require 불가 — frontmatter만 최소로
// 파싱한다. automation/build.py의 빌드 로직은 재구현하지 않는다(목록 표시 용도로 충분).
const getBlogPosts = (account) => {
  const postsDir = path.join(account.blogRepoPath, 'content', 'posts');
  if (!fs.existsSync(postsDir)) return { available: false, posts: [] };

  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith('.md'));
  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    const meta = match ? (yaml.load(match[1]) || {}) : {};
    return { file, ...meta };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return { available: true, posts };
};

module.exports = {
  getQueue, getTopicBank, getTopicState, getUpcomingTopicPreview,
  getPlatformPerformance, getQuestionPerformance, groupQueueByBatch, getBlogPosts
};
