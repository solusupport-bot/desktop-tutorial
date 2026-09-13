const log = require('../logger');
const { loadQueue, saveQueue } = require('./queue');
const { PLATFORMS } = require('../publishing');

// 2026-09-13 사용자 지적("계속 안 올라가는데 근본적인 대책이 필요하다") — 실측 확인:
// 같은 날 오후 한 게시물의 Threads/Facebook/Instagram 3개 플랫폼이 전부 "publish
// failed"로 실패했는데(원인은 CDN 일시 지연/Meta 쪽 순간 오류로 추정 — 같은 URL이
// 몇 초/몇 분 뒤 curl로는 정상 접근됨), 그 뒤로 이 게시물이 다시는 시도되지 않고
// 영원히 'partial' 상태로 방치되고 있었다. claimDuePosts가 status==='pending'만
// 다시 집어가므로, 한 번 실패한 플랫폼은 원인이 일시적이든 아니든 재시도 자체가
// 없는 구조적 결함이었다 — 이게 "글이 계속 안 올라간다"는 증상의 근본 원인이다.
// 실패 후 일정 시간(RETRY_DELAY_MS)이 지나면 자동으로 다시 시도하고, 무한 재시도로
// API를 낭비하지 않도록 최대 횟수(MAX_RETRIES)를 둔다.
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30 * 60 * 1000; // 30분

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
 *
 * 'partial'(일부 플랫폼 실패) 상태인 항목도, 마지막 시도로부터 RETRY_DELAY_MS가
 * 지났고 재시도 횟수가 MAX_RETRIES 미만이면 다시 claim한다 — pending과 동일한
 * "소유권" 안전장치가 그대로 적용된다.
 */
const claimDuePosts = () => {
  const queue = loadQueue();
  const now = new Date();
  let changed = false;

  for (const item of queue) {
    if (item.status === 'pending') {
      if (new Date(item.scheduledAt) > now) continue;
      item.status = 'claimed';
      changed = true;
    } else if (item.status === 'partial') {
      const retryCount = item.retryCount || 0;
      const lastAttemptMs = new Date(item.processedAt || item.scheduledAt).getTime();
      if (retryCount < MAX_RETRIES && now.getTime() - lastAttemptMs >= RETRY_DELAY_MS) {
        item.status = 'claimed';
        item.retryCount = retryCount + 1;
        changed = true;
      }
    }
  }

  if (changed) saveQueue(queue);
  return changed;
};

/**
 * claimDuePosts가 표시하고 워크플로가 커밋/푸시에 성공한 'claimed' 게시글만 실제로
 * 발행합니다. 플랫폼별 성공/실패를 개별 기록하며, 하나라도 실패하면 status를
 * 'partial'로 남깁니다.
 *
 * 재시도로 다시 들어온 항목은 이전에 이미 성공한 플랫폼을 건드리지 않는다 —
 * item.results[platform]에 에러 없는 결과가 이미 있으면 건너뛴다. 그렇지 않으면
 * 재시도 때마다 이미 올라간 플랫폼에 같은 글이 중복으로 다시 게시된다.
 */
const publishClaimedPosts = async () => {
  const queue = loadQueue();
  let changed = false;

  for (const item of queue) {
    if (item.status !== 'claimed') continue;

    const retryLabel = item.retryCount ? ` (재시도 ${item.retryCount}/${MAX_RETRIES})` : '';
    log.section(`예약 발행 처리: ${item.id}${retryLabel}`);
    let allOk = true;

    for (const platform of item.platforms) {
      const already = item.results[platform];
      if (already && !already.error) {
        log.ok(`[${platform}] 이전 시도에서 이미 성공 — 재시도 건너뜀`);
        continue;
      }

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
      if (platform === 'reddit' || platform === 'pinterest') {
        // Reddit(subreddit)/Pinterest(blogUrl)는 큐 항목에 붙은 부가 필드가 필요해
        // item 전체를 전달한다.
        result = await handler.publish(item);
      } else {
        // 다른 플랫폼은 기존 방식 유지
        result = await handler.publish({ text: item.text, imageUrl: item.imageUrl, imageUrls: item.imageUrls, videoUrl: item.videoUrl });
      }
      item.results[platform] = result || { error: 'publish failed' };
      if (!result) allOk = false;
    }

    if (!allOk && (item.retryCount || 0) >= MAX_RETRIES) {
      log.err(`[${item.id}] 최대 재시도(${MAX_RETRIES}회) 초과 — 더 이상 자동 재시도하지 않습니다. 수동 확인 필요.`);
    }

    item.status = allOk ? 'published' : 'partial';
    item.processedAt = new Date().toISOString();
    changed = true;
  }

  if (changed) saveQueue(queue);
  return changed;
};

module.exports = { claimDuePosts, publishClaimedPosts, MAX_RETRIES, RETRY_DELAY_MS };
