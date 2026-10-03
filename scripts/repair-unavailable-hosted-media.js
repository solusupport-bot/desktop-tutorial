const { loadQueue, saveQueue } = require('../lib/scheduler/queue');

const HOSTED_MEDIA_PREFIX = 'https://landinkorea.com/sns-media/';
const RECOVERABLE_PLATFORMS = new Set(['facebook']);

const queue = loadQueue();
let repaired = 0;

for (const item of queue) {
  const platform = item.platforms?.[0];
  if (item.status !== 'partial' || !RECOVERABLE_PLATFORMS.has(platform)) continue;
  if (!(item.imageUrls || []).some((url) => url.startsWith(HOSTED_MEDIA_PREFIX))) continue;
  item.videoUrl = null;
  item.imageUrl = null;
  item.imageUrls = [];

  item.results[platform] = { error: 'awaiting text-only retry because watermarked media is unavailable' };
  item.retryCount = Math.min(item.retryCount || 0, 2);
  repaired += 1;
}

if (repaired > 0) saveQueue(queue);
console.log(`원본 미디어 재시도 준비: ${repaired}건`);
