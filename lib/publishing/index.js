const { publishToThreads } = require('./threads');
const { publishToFacebook } = require('./facebook');
const { publishToInstagram } = require('./instagram');
const { publishToReddit } = require('./reddit');
const { publishToPinterest } = require('./pinterest');
const { publishToBluesky } = require('./bluesky');
const { publishToMastodon } = require('./mastodon');

/**
 * 플랫폼 발행 레지스트리. 새 플랫폼(TikTok, X 등)을 추가할 때는
 * 이 자리에 { publish, requiresMedia } 형태의 항목만 등록하면 됩니다.
 *
 * bluesky/mastodon은 requiresMedia: false다 — 둘 다 텍스트만으로도 정상 발행되고,
 * 오히려 이미지가 없을 때 다른 채널이 미디어 부족으로 큐 등록을 건너뛰는 날에도
 * 발행이 이어지는 게 이 두 채널을 넣은 이유 중 하나다(승인 대기 없이 항상 살아 있는
 * 발행 경로 확보).
 */
const PLATFORMS = {
  threads: { publish: publishToThreads, requiresMedia: false },
  facebook: { publish: publishToFacebook, requiresMedia: false },
  instagram: { publish: publishToInstagram, requiresMedia: true },
  reddit: { publish: publishToReddit, requiresMedia: false },
  pinterest: { publish: publishToPinterest, requiresMedia: true },
  bluesky: { publish: publishToBluesky, requiresMedia: false },
  mastodon: { publish: publishToMastodon, requiresMedia: false }
};

module.exports = { PLATFORMS };
