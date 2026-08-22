const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'topic_state.json');

const loadState = () => {
  if (!fs.existsSync(STATE_PATH)) return { lastIndex: -1, history: [] };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
};

const saveState = (state) => {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

/**
 * 주제 배열을 순환하며 "다음 주제"를 하나씩 반환합니다.
 * 상태(마지막으로 쓴 인덱스)는 data/topic_state.json에 저장되어,
 * 매일 실행해도 같은 주제가 반복되지 않고 순서대로 돌아갑니다.
 */
const pickNextTopic = (topics) => {
  const state = loadState();
  const nextIndex = (state.lastIndex + 1) % topics.length;
  const topic = topics[nextIndex];

  state.lastIndex = nextIndex;
  state.history = [...(state.history || []), { index: nextIndex, topic: topic.source, at: new Date().toISOString() }].slice(-30);
  saveState(state);

  return topic;
};

module.exports = { pickNextTopic, loadState, saveState, STATE_PATH };
