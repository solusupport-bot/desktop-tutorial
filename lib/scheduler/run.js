const log = require('../logger');
const axios = require('axios');
const { loadQueue, saveQueue } = require('./queue');
const { PLATFORMS } = require('../publishing');
const { getBlogLinkForTopic, withUtm, BLOG_HOME_URL } = require('../ingestion/topic_blog_links');
const { applyPlatformLinkRule, ensureVideoAttribution } = require('./content_rules');
const { canPublishNow, loadState: loadApiSafetyState, recordPublishResult } = require('./api_safety');
const { isPlatformPaused } = require('./paused_platforms');

const HOSTED_MEDIA_PREFIX = 'https://landinkorea.com/sns-media/';
const firstUnavailableHostedMedia = async (item) => {
  const selectedMedia = item.videoUrl ? [item.videoUrl]
    : item.imageUrls?.length ? item.imageUrls : [item.imageUrl];
  const urls = [...new Set(selectedMedia
    .filter((url) => typeof url === 'string' && url.startsWith(HOSTED_MEDIA_PREFIX)))];
  for (const url of urls) {
    try {
      await axios.head(url, { timeout: 10000 });
    } catch (err) {
      return url;
    }
  }
  return null;
};

const textWithBlogLink = (item, platform) => {
  const blogUrl = item.blogUrl || (item.topic ? withUtm(getBlogLinkForTopic(item.topic), platform) : null);
  if (!blogUrl || blogUrl.startsWith(BLOG_HOME_URL)) return item.text;
  if (item.text.includes(blogUrl)) return item.text;
  if (/📖 More on the blog — link in bio\.?/.test(item.text)) {
    return item.text.replace(/📖 More on the blog — link in bio\.?/, `📖 Full guide: ${blogUrl}`);
  }
  return `${item.text}\n\n📖 Full guide: ${blogUrl}`;
};

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

// 발행기들은 토큰이 없으면 "모의 발행"을 하고 가짜 id로 성공을 돌려준다. 2026-09-25
// GitHub Actions 정지로 발행을 이 PC로 옮기면서, Secrets에만 있던 토큰이 .env에 아직
// 없는 플랫폼 글이 실제로는 안 올라갔는데 published로 기록될 수 있었다. 토큰이 없는
// 플랫폼 글은 claim하지 않고 pending으로 남겨, 토큰이 들어오는 즉시 발행되게 한다.
const REQUIRED_ENV = {
  threads: ['THREADS_ACCESS_TOKEN', 'THREADS_USER_ID'],
  facebook: ['FB_PAGE_ACCESS_TOKEN', 'FB_PAGE_ID'],
  instagram: ['IG_ACCESS_TOKEN', 'IG_USER_ID'],
  pinterest: ['PINTEREST_ACCESS_TOKEN', 'PINTEREST_BOARD_ID'],
  bluesky: ['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD'],
  mastodon: ['MASTODON_INSTANCE', 'MASTODON_ACCESS_TOKEN'],
  tumblr: ['TUMBLR_CONSUMER_KEY', 'TUMBLR_CONSUMER_SECRET', 'TUMBLR_TOKEN', 'TUMBLR_TOKEN_SECRET', 'TUMBLR_BLOG_IDENTIFIER'],
  reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD']
};
const hasCredentials = (platform) => (REQUIRED_ENV[platform] || []).every((k) => process.env[k]);

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
 *
 * 2026-09-18 사용자 결정: 검증(verifyStatus) 하드 게이트도 제거하고 완전 자동 발행으로
 * 전환한다 — verify-no-duplicate-media.js/verify-topic-media-alignment.js는 여전히
 * 실행되어 verifyStatus를 기록하지만 더 이상 발행을 막지 않는다. approved 필드도
 * queue.js에서 기본값 true로 바뀌어 사실상 게이트 역할을 하지 않는다.
 */
const claimDuePosts = () => {
  const queue = loadQueue();
  const now = new Date();
  let changed = false;

  // 발행이 멈췄다 재개되면 밀린 글이 한 실행에 전부 claim돼 같은 계정에 수십 개가 한꺼번에
  // 올라간다(2026-09-25, Actions 정지로 하루치 50여 건이 밀림). 한 실행당 플랫폼별 1건만
  // 가져가 15분 간격으로 자연스럽게 풀리게 한다.
  const claimedPlatforms = new Set();
  const claimedGroups = new Set();
  const apiSafetyState = loadApiSafetyState();
  const publishedTexts = new Set(queue
    .filter((i) => i.status === 'published')
    .flatMap((i) => i.platforms.map((p) => `${p}|${i.text}`)));

  const byTime = [...queue].sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  for (const item of byTime) {
    const platforms = item.platforms || [];
    if (platforms.some(isPlatformPaused)) continue;
    if (!platforms.every(hasCredentials)) continue;
    if (platforms.some((p) => claimedPlatforms.has(p))) continue;
    const safetyChecks = platforms.map((platform) => canPublishNow(platform, now, apiSafetyState));
    if (safetyChecks.some((check) => !check.allowed)) {
      const reasons = safetyChecks.filter((check) => !check.allowed).map((check) => check.reason).join(', ');
      log.warn(`[API 보호] ${platforms.join(', ')} 발행을 다음 실행으로 연기: ${reasons}`);
      continue;
    }
    if (safetyChecks.some((check) => claimedGroups.has(check.group))) continue;
    // SNS의 목적은 해당 주제의 블로그 글 방문이다. 글이 아직 없으면
    // pending/partial 모두 그대로 두고 링크가 등록된 다음 실행에서 처리한다.
    if (item.topic && getBlogLinkForTopic(item.topic) === BLOG_HOME_URL) continue;
    if (item.status === 'pending') {
      if (new Date(item.scheduledAt) > now) continue;
      if (!item.approved) continue;
      if (platforms.some((p) => publishedTexts.has(`${p}|${item.text}`))) {
        item.status = 'rejected';
        item.rejectReason = 'duplicate: same text already published on this platform';
        changed = true;
        continue;
      }
      item.status = 'claimed';
      platforms.forEach((p) => claimedPlatforms.add(p));
      safetyChecks.forEach((check) => claimedGroups.add(check.group));
      changed = true;
    } else if (item.status === 'partial') {
      const retryCount = item.retryCount || 0;
      const lastAttemptMs = new Date(item.processedAt || item.scheduledAt).getTime();
      if (retryCount < MAX_RETRIES && now.getTime() - lastAttemptMs >= RETRY_DELAY_MS) {
        item.status = 'claimed';
        item.retryCount = retryCount + 1;
        platforms.forEach((p) => claimedPlatforms.add(p));
        safetyChecks.forEach((check) => claimedGroups.add(check.group));
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
 *
 * 2026-11-06 사고 재발 방지 — 두 가지를 추가한다:
 * 1) 발행 직전에 같은 텍스트가 해당 플랫폼에 이미 "성공" 기록으로 남아있는지
 *    큐 전체(claimDuePosts의 publishedTexts와 동일한 발상)에서 한 번 더 확인한다.
 *    claimDuePosts의 중복검사는 claim 시점(pending -> claimed) 한 번뿐이라, 어떤
 *    이유로든(예: commit 실패로 published 저장이 안 돼 claimed가 영구화) 같은
 *    항목이 다시 이 함수에 들어오면 뚫렸다 — 여기서도 막아야 실제 재발행을 막는다.
 * 2) 항목 하나 처리 중 예외가 나도 루프 전체가 죽지 않게 try/catch로 감싸고,
 *    항목마다 즉시 saveQueue한다. 기존 코드는 루프 끝에서 한 번만 저장했는데,
 *    어떤 항목에서 예외가 나면 그 실행에서 이미 실제로 발행된(변경 불가능한)
 *    다른 항목들의 published 저장까지 통째로 날아가 다음 실행이 또 중복
 *    발행하는 사고로 이어졌다(ci-commit-push.sh 권한 버그와 겹쳐 실제로 발생).
 */
const publishClaimedPosts = async () => {
  const queue = loadQueue();
  let changed = false;

  const publishedTexts = new Set(queue
    .filter((i) => i.status === 'published' || Object.values(i.results || {}).some((r) => r && !r.error))
    .flatMap((i) => (i.platforms || [])
      .filter((p) => i.results && i.results[p] && !i.results[p].error)
      .map((p) => `${p}|${i.text}`)));

  for (const item of queue) {
    if (item.status !== 'claimed') continue;

    if ((item.platforms || []).some(isPlatformPaused)) {
      log.warn(`[발행 일시 중지] ${item.platforms.join(', ')}: ${item.id}`);
      item.status = Object.values(item.results || {}).some((result) => result && !result.error)
        ? 'partial' : 'pending';
      changed = true;
      saveQueue(queue);
      continue;
    }

    const retryLabel = item.retryCount ? ` (재시도 ${item.retryCount}/${MAX_RETRIES})` : '';
    log.section(`예약 발행 처리: ${item.id}${retryLabel}`);
    let allOk = true;

    try {
    for (const platform of item.platforms) {
      const already = item.results[platform];
      if (already && !already.error) {
        log.ok(`[${platform}] 이전 시도에서 이미 성공 — 재시도 건너뜀`);
        continue;
      }

      if (publishedTexts.has(`${platform}|${item.text}`)) {
        log.warn(`[${platform}] 같은 텍스트가 이미 발행됨 — 중복 발행을 건너뜁니다: ${item.id}`);
        item.results[platform] = { skipped: true, reason: 'duplicate: same text already published on this platform' };
        continue;
      }

      const handler = PLATFORMS[platform];
      if (!handler) {
        log.warn(`알 수 없는 플랫폼: ${platform}`);
        item.results[platform] = { error: 'unknown platform' };
        allOk = false;
        continue;
      }
      let payload = {
        ...item,
        text: ensureVideoAttribution(
          applyPlatformLinkRule(platform, item.text, item.topic),
          item.videoUrl ? item.sourceVideoUrl : null
        )
      };
      const unavailableMedia = await firstUnavailableHostedMedia(item);
      if (unavailableMedia && (platform === 'threads' || platform === 'facebook')) {
        log.warn(`[${platform}] 워터마크 미디어를 가져올 수 없어 텍스트 게시물로 전환합니다.`);
        payload = {
          ...payload,
          text: platform === 'facebook' ? textWithBlogLink(payload, platform) : payload.text,
          imageUrl: null,
          imageUrls: [],
          videoUrl: null
        };
      } else if (unavailableMedia) {
        log.err(`[${platform}] 워터마크 미디어를 가져올 수 없어 발행을 건너뜁니다.`);
        item.results[platform] = { error: 'watermarked media unavailable' };
        allOk = false;
        continue;
      }
      if (handler.requiresMedia && !payload.imageUrl && !(payload.imageUrls && payload.imageUrls.length) && !payload.videoUrl) {
        log.err(`${platform}은 이미지/영상이 필요한데 없습니다. 건너뜁니다.`);
        item.results[platform] = { error: 'imageUrl or videoUrl required' };
        allOk = false;
        continue;
      }

      // 모든 발행기에 전체 payload를 넘긴다. Bluesky/Mastodon/Tumblr도 blogUrl과
      // topic을 사용해 클릭 가능한 링크와 미디어 대체 텍스트를 만든다. 일부 필드만
      // 넘기면 큐에는 blogUrl이 있어도 실제 게시물에서는 링크가 사라진다.
      const result = await handler.publish(payload);
      item.results[platform] = result || { error: 'publish failed' };
      recordPublishResult(platform, Boolean(result));
      if (result) {
        publishedTexts.add(`${platform}|${item.text}`);
      } else {
        allOk = false;
      }
    }

    if (!allOk && (item.retryCount || 0) >= MAX_RETRIES) {
      log.err(`[${item.id}] 최대 재시도(${MAX_RETRIES}회) 초과 — 더 이상 자동 재시도하지 않습니다. 수동 확인 필요.`);
    }

    item.status = allOk ? 'published' : 'partial';
    item.processedAt = new Date().toISOString();
    } catch (err) {
      // 이 항목에서 예외가 나도 다른 항목은 영향받지 않는다 — 이 항목만 다음 시도로
      // 미루고(partial), 지금까지 이 실행에서 이미 처리한 항목들의 저장은 그대로 지킨다.
      log.err(`[${item.id}] 발행 처리 중 예외 발생 — 이 항목은 다음 재시도로 미룹니다: ${err.message}`);
      item.status = 'partial';
      item.processedAt = new Date().toISOString();
    }
    changed = true;
    saveQueue(queue);
  }

  return changed;
};

module.exports = { claimDuePosts, publishClaimedPosts, MAX_RETRIES, RETRY_DELAY_MS };
