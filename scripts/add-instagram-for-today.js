#!/usr/bin/env node
// 오늘 이미 Threads/Facebook용으로 큐에 등록된 3개 주제에 대해 Instagram용 게시글을
// 추가로 큐에 등록한다. 이미지는 이미 그 주제에 쓴 것을 그대로 재사용해 Pexels를
// 다시 호출하지 않는다 (오늘 발행할 세 주제는 lib/scheduler/topic_rotation.js의
// pickNextTopic이 seed=history.length로 고른 각도와 정확히 같아야 텍스트가 안 겹친다).
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { curateContent } = require('../lib/curation/curate');
const { addPost, loadQueue } = require('../lib/scheduler/queue');
const { loadState } = require('../lib/scheduler/topic_rotation');

const main = async () => {
  const state = loadState();
  const queue = loadQueue();
  const topics = await fetchKoreaTravelTopics();

  // 오늘 등록된 history 항목 수 = 하루 3개(POSTS_PER_DAY) 중 오늘 날짜에 해당하는 것만.
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = state.history.filter((h) => h.at.slice(0, 10) === today);

  if (todayEntries.length === 0) {
    log.err('오늘 등록된 주제가 없습니다 (daily-topic.yml이 아직 안 돌았을 수 있음).');
    process.exit(1);
  }

  log.section(`오늘 주제 ${todayEntries.length}개에 Instagram 게시글 추가`);

  for (const entry of todayEntries) {
    const seedAtCall = state.history.findIndex((h) => h === entry);
    const item = topics.find((t) => t.source === entry.topic);
    if (!item) {
      log.warn(`"${entry.topic}" 주제를 korea_travel.js에서 못 찾음, 건너뜀`);
      continue;
    }

    // 오늘 이미 큐에 들어간 같은 주제의 facebook 항목에서 imageUrl을 재사용한다.
    // daily-auto-post.js는 한 주제를 고르는 즉시 그 주제의 threads/facebook 큐 항목을
    // 같은 실행 안에서 바로 만들기 때문에, createdAt이 history 기록 시각(entry.at)과
    // 가장 가까운 facebook 항목이 바로 이 주제의 항목이다.
    const matchingContent = Array.isArray(item.content) ? item.content[seedAtCall % item.content.length] : item.content;
    const entryTime = new Date(entry.at).getTime();
    const fbCandidates = queue.filter((q) => q.platforms.includes('facebook') && q.createdAt);
    const fbEntry = fbCandidates.reduce((closest, q) => {
      const diff = Math.abs(new Date(q.createdAt).getTime() - entryTime);
      return (!closest || diff < closest.diff) ? { q, diff } : closest;
    }, null)?.q;
    const reusedImage = (fbEntry && Math.abs(new Date(fbEntry.createdAt).getTime() - entryTime) < 60000) ? fbEntry.imageUrl : null;

    const rawItem = { source: item.source, author: item.author, url: item.url, content: matchingContent };
    const curated = await curateContent(rawItem, ['instagram'], seedAtCall);

    log.ok(`[${entry.topic}] Instagram 캡션: ${curated.instagram}`);
    log.ok(`[${entry.topic}] 재사용 이미지: ${reusedImage}`);

    if (!reusedImage) {
      log.warn(`[${entry.topic}] 이미지를 재사용할 기존 항목을 못 찾음 — 이 주제는 건너뜀 (Instagram은 이미지 필수)`);
      continue;
    }

    const queued = addPost({
      text: curated.instagram,
      imageUrl: reusedImage,
      platforms: ['instagram'],
      scheduledAt: new Date().toISOString()
    });
    log.ok(`[${entry.topic}] Instagram 큐 등록 완료 (id=${queued.id})`);
  }
};

main();
