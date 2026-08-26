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
const addPost = ({ text, imageUrl, imageUrls, platforms, scheduledAt }) => {
  const queue = loadQueue();
  const item = {
    id: crypto.randomUUID(),
    text,
    imageUrl: imageUrl || (imageUrls && imageUrls[0]) || null,
    // Threads 캐로셀 등 2장 이상을 쓰는 플랫폼용. 없으면 항상 undefined로 두어
    // 기존에 저장된 큐 항목(단일 imageUrl만 있는)과 형식이 계속 호환됩니다.
    ...(imageUrls && imageUrls.length > 0 ? { imageUrls } : {}),
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
