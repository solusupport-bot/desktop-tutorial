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
const addPost = ({ text, imageUrl, imageUrls, videoUrl, platforms, scheduledAt, ...extra }) => {
  const queue = loadQueue();
  const item = {
    id: crypto.randomUUID(),
    text,
    imageUrl: imageUrl || (imageUrls && imageUrls[0]) || null,
    // Threads 캐로셀 등 2장 이상을 쓰는 플랫폼용. 없으면 항상 undefined로 두어
    // 기존에 저장된 큐 항목(단일 imageUrl만 있는)과 형식이 계속 호환됩니다.
    ...(imageUrls && imageUrls.length > 0 ? { imageUrls } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    platforms,
    scheduledAt: scheduledAt || new Date().toISOString(),
    status: 'pending',
    results: {},
    createdAt: new Date().toISOString(),
    // 2026-09-04: 이 destructuring이 정해진 필드만 받고 있어서, daily-auto-post.js가
    // Reddit용 subreddit/topic, Pinterest용 blogUrl/topic을 postData에 얹어도 여기서
    // 전부 잘려나가 queue.json에 저장되지 않는 버그가 있었다 — publishClaimedPosts가
    // item 전체를 넘겨도 item.subreddit/item.blogUrl이 항상 undefined였다는 뜻이라,
    // 지금까지 구현한 Reddit/Pinterest는 이 필드 없이는 애초에 작동할 수 없었다.
    // 나머지 필드를 전부 보존해 향후 플랫폼도 같은 함정에 빠지지 않게 한다.
    ...extra
  };
  queue.push(item);
  saveQueue(queue);
  return item;
};

module.exports = { loadQueue, saveQueue, addPost, QUEUE_PATH };
