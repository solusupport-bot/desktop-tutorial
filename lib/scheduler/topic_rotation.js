const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'topic_state.json');
// 주제 풀이 14개(2026-08-29 기준)이고 주제당 최대 5장을 쓰므로, 한 바퀴(14개 주제)를
// 다 도는 데 최대 ~70장이 소모됩니다. 24장짜리 기억은 1.5일치도 안 돼서, 주제가
// 다시 돌아올 때(3개/일 기준 약 4.5일 뒤)면 이미 다 잊혀져 같은 사진이 반복됐습니다
// (2026-08-29 실측 — 사용자가 직접 중복을 지적함). 최소 한 바퀴 반은 기억하도록 넉넉히 늘림.
const MAX_RECENT_IMAGES = 120;

const loadState = () => {
  if (!fs.existsSync(STATE_PATH)) return { lastIndex: -1, history: [], recentImageUrls: [], recentVideoUrls: [], recentMusicUrls: [] };
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  state.recentImageUrls = state.recentImageUrls || [];
  state.recentVideoUrls = state.recentVideoUrls || [];
  state.recentMusicUrls = state.recentMusicUrls || [];
  return state;
};

const saveState = (state) => {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

/** content가 배열(여러 각도)이면 seed로 하나를 골라 문자열로 확정합니다. */
const pickAngle = (content, seed) => (Array.isArray(content) ? content[seed % content.length] : content);

/**
 * 주제 배열을 순환하며 "다음 주제"를 하나씩 반환합니다. 같은 주제를 다시 다룰 때
 * 문구가 겹치지 않도록 seed(지금까지 누적 게시 횟수)로 (1) 콘텐츠 각도, (2) 질문/CTA 문구,
 * (3) 이미지 검색어를 모두 다르게 회전시킵니다.
 * 상태는 data/topic_state.json에 저장되어 매일 실행해도 순서가 이어집니다.
 */
const pickNextTopic = (topics) => {
  const state = loadState();
  const nextIndex = (state.lastIndex + 1) % topics.length;
  const topic = topics[nextIndex];
  const seed = state.history.length;

  state.lastIndex = nextIndex;
  state.history = [...state.history, { index: nextIndex, topic: topic.source, at: new Date().toISOString() }].slice(-60);
  saveState(state);

  return { topic: { ...topic, content: pickAngle(topic.content, seed) }, seed };
};

/** 최근 사용한 이미지 URL 목록(중복 방지용)을 반환합니다. */
const getRecentImageUrls = () => loadState().recentImageUrls;

/** 이번에 사용한 이미지 URL을 기록해 다음번 중복 검사에 활용합니다. */
const recordImageUrl = (url) => {
  if (!url) return;
  const state = loadState();
  state.recentImageUrls = [...state.recentImageUrls, url].slice(-MAX_RECENT_IMAGES);
  saveState(state);
};

/** 최근 사용한 영상 URL 목록(중복 방지용) — 사진과 동일한 규칙을 영상에도 적용합니다. */
const getRecentVideoUrls = () => loadState().recentVideoUrls;

const recordVideoUrl = (url) => {
  if (!url) return;
  const state = loadState();
  state.recentVideoUrls = [...state.recentVideoUrls, url].slice(-MAX_RECENT_IMAGES);
  saveState(state);
};

/** 최근 사용한 배경음악 URL 목록(같은 곡이 계속 반복되지 않도록) — 사진/영상과 동일한 규칙. */
const getRecentMusicUrls = () => loadState().recentMusicUrls;

const recordMusicUrl = (url) => {
  if (!url) return;
  const state = loadState();
  state.recentMusicUrls = [...state.recentMusicUrls, url].slice(-MAX_RECENT_IMAGES);
  saveState(state);
};

/**
 * pickNextTopic처럼 상태를 변경(저장)하지 않고, 앞으로 count번 pickNextTopic을
 * 불렀을 때 나올 결과를 미리 내다본다. 자동화 실행 전에 다가올 주제/seed를 알아야
 * 그 콘텐츠를 미리 써서 큐(prewritten_content.js)에 채워둘 수 있다(2026-08-30).
 */
const peekUpcomingTopics = (topics, count) => {
  const state = loadState();
  const results = [];
  for (let i = 0; i < count; i += 1) {
    const nextIndex = (state.lastIndex + 1 + i) % topics.length;
    const topic = topics[nextIndex];
    const seed = state.history.length + i;
    results.push({
      seed,
      source: topic.source,
      author: topic.author,
      url: topic.url,
      content: pickAngle(topic.content, seed)
    });
  }
  return results;
};

module.exports = {
  pickNextTopic,
  peekUpcomingTopics,
  getRecentImageUrls,
  recordImageUrl,
  getRecentVideoUrls,
  recordVideoUrl,
  getRecentMusicUrls,
  recordMusicUrl,
  loadState,
  saveState,
  STATE_PATH
};
