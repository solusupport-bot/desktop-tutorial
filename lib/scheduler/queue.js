const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUEUE_PATH = path.join(__dirname, '..', '..', 'data', 'queue.json');

const loadQueue = () => {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
};

const saveQueue = (queue) => {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
};

/**
 * 예약 게시글을 큐에 추가합니다. scheduledAt을 생략하면 다음 스케줄러 실행 시 즉시 발행됩니다.
 */
const addPost = ({ text, imageUrl, platforms, scheduledAt }) => {
  const queue = loadQueue();
  const item = {
    id: crypto.randomUUID(),
    text,
    imageUrl: imageUrl || null,
    platforms,
    scheduledAt: scheduledAt || new Date().toISOString(),
    status: 'pending',
    results: {},
    createdAt: new Date().toISOString()
  };
  queue.push(item);
  saveQueue(queue);
  return item;
};

module.exports = { loadQueue, saveQueue, addPost, QUEUE_PATH };
