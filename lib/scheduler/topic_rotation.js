const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'topic_state.json');
const MAX_RECENT_IMAGES = 12;

const loadState = () => {
  if (!fs.existsSync(STATE_PATH)) return { lastIndex: -1, history: [], recentImageUrls: [] };
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  state.recentImageUrls = state.recentImageUrls || [];
  return state;
};

const saveState = (state) => {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

/**
 * 주제 배열을 순환하며 "다음 주제"를 하나씩 반환합니다. 같은 주제를 다시 다룰 때
 * 문구가 겹치지 않도록 seed(지금까지 누적 게시 횟수)도 함께 반환합니다.
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

  return { topic, seed };
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

module.exports = { pickNextTopic, getRecentImageUrls, recordImageUrl, loadState, saveState, STATE_PATH };
