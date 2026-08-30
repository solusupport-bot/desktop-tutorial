const fs = require('fs');
const path = require('path');

// SNS 캡션/블로그 글을 자동화 실행 중에 유료 Claude API로 그때그때 생성하지 않고,
// 미리(대화형 Claude Code 세션 — 별도 API 과금이 없는 경로) 써둔 결과를 여기서
// 읽어 쓴다(2026-08-30 사용자 요청 — 자동 댓글 답장과 원문 작성이 둘 다 API를
// 호출하면 비용이 이중으로 나간다는 지적). 큐에 없으면 호출부가 기존 규칙 기반
// 템플릿으로 대체한다 — daily-topic.yml에서 ANTHROPIC_API_KEY 자체를 뺐으므로
// 자동 실행 중엔 유료 API가 호출될 일이 없다.
const makeQueue = (filename) => {
  const QUEUE_PATH = path.join(__dirname, '..', '..', 'data', filename);

  const load = () => {
    if (!fs.existsSync(QUEUE_PATH)) return {};
    return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  };

  const save = (queue) => {
    fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
  };

  const get = (key) => load()[String(key)] || null;

  const set = (key, value) => {
    const queue = load();
    queue[String(key)] = value;
    save(queue);
  };

  return { get, set, load, save, QUEUE_PATH };
};

module.exports = {
  // key: daily-auto-post.js가 주제를 뽑을 때 함께 나오는 seed(전역 누적 게시 횟수) — 절대 재사용되지 않는 값이라 유일한 키로 쓸 수 있다.
  snsContentQueue: makeQueue('sns_content_queue.json'),
  // key: 주제명(topic.source) — 주제 하나당 블로그 글은 평생 한 번만 필요하므로 seed보다 이게 더 안정적인 키다.
  blogContentQueue: makeQueue('blog_content_queue.json')
};
