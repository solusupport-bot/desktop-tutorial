const log = require('../logger');
const { loadQueue, saveQueue } = require('./queue');
const { PLATFORMS } = require('../publishing');

/**
 * 예약 시각이 지난 대기(pending) 게시글을 'claimed' 상태로 표시만 하고 실제 발행은
 * 하지 않는다 — claimDuePosts -> (워크플로가 이 변경을 커밋/푸시) -> publishClaimedPosts
 * 순서로 나눈 이유는 2026-09-01 실제 사고 때문이다: 수동 재시도 dispatch와 마침 그
 * 순간 다시 돌아온 cron이 거의 동시에 시작되면서, 둘 다 같은 "pending" 상태의 큐를
 * 읽고 같은 항목 3개를 각자 발행해 실제로 두 번씩 게시된 적이 있다(concurrency
 * group만으로는 완전히 막지 못함 — 두 실행이 겹치는 짧은 창이 실제로 존재).
 * claim 단계에서 커밋+푸시가 원격 저장소에 성공한 쪽만 그 항목들의 "소유권"을
 * 갖는다 — 나중에 시작한 실행은 claim 커밋 자체가 푸시 거부(non-fast-forward)로
 * 실패해 그 자리에서 잡을 멈추고, Threads/Facebook/Instagram API는 아예 호출되지
 * 않는다(발행 이후 되돌릴 수 없는 것과 달리, git push 실패는 100% 안전하게 막을 수
 * 있는 지점이다).
 */
const claimDuePosts = () => {
  const queue = loadQueue();
  const now = new Date();
  let changed = false;

  for (const item of queue) {
    if (item.status !== 'pending') continue;
    if (new Date(item.scheduledAt) > now) continue;
    item.status = 'claimed';
    changed = true;
  }

  if (changed) saveQueue(queue);
  return changed;
};

/**
 * claimDuePosts가 표시하고 워크플로가 커밋/푸시에 성공한 'claimed' 게시글만 실제로
 * 발행합니다. 플랫폼별 성공/실패를 개별 기록하며, 하나라도 실패하면 status를
 * 'partial'로 남깁니다.
 */
const publishClaimedPosts = async () => {
  const queue = loadQueue();
  let changed = false;

  for (const item of queue) {
    if (item.status !== 'claimed') continue;

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

      let result;
      if (platform === 'reddit') {
        // Reddit은 item 전체를 전달 (subreddit 정보 포함)
        result = await handler.publish(item);
      } else {
        // 다른 플랫폼은 기존 방식 유지
        result = await handler.publish({ text: item.text, imageUrl: item.imageUrl, imageUrls: item.imageUrls, videoUrl: item.videoUrl });
      }
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

module.exports = { claimDuePosts, publishClaimedPosts };
