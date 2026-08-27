const log = require('../logger');
const { loadQueue, saveQueue } = require('./queue');
const { PLATFORMS } = require('../publishing');

/**
 * 예약 시각이 지난 대기(pending) 게시글을 모두 찾아 해당 플랫폼들에 발행합니다.
 * 플랫폼별 성공/실패를 개별 기록하며, 하나라도 실패하면 status를 'partial'로 남깁니다.
 */
const runDuePosts = async () => {
  const queue = loadQueue();
  const now = new Date();
  let changed = false;

  for (const item of queue) {
    if (item.status !== 'pending') continue;
    if (new Date(item.scheduledAt) > now) continue;

    log.section(`예약 발행 처리: ${item.id}`);
    let allOk = true;

    for (const platform of item.platforms) {
      const handler = PLATFORMS[platform];
      if (!handler) {
        log.warn(`알 수 없는 플랫폼: ${platform}`);
        item.results[platform] = { error: 'unknown platform' };
        allOk = false;
        continue;
      }
      if (handler.requiresMedia && !item.imageUrl && !(item.imageUrls && item.imageUrls.length) && !item.videoUrl) {
        log.err(`${platform}은 이미지/영상이 필요한데 없습니다. 건너뜁니다.`);
        item.results[platform] = { error: 'imageUrl or videoUrl required' };
        allOk = false;
        continue;
      }

      const result = await handler.publish({ text: item.text, imageUrl: item.imageUrl, imageUrls: item.imageUrls, videoUrl: item.videoUrl });
      item.results[platform] = result || { error: 'publish failed' };
      if (!result) allOk = false;
    }

    item.status = allOk ? 'published' : 'partial';
    item.processedAt = new Date().toISOString();
    changed = true;
  }

  if (changed) saveQueue(queue);
  return changed;
};

module.exports = { runDuePosts };
