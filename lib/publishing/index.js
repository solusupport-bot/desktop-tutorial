const { publishToThreads } = require('./threads');
const { publishToFacebook } = require('./facebook');
const { publishToInstagram } = require('./instagram');

/**
 * 플랫폼 발행 레지스트리. 새 플랫폼(TikTok, X 등)을 추가할 때는
 * 이 자리에 { publish, requiresMedia } 형태의 항목만 등록하면 됩니다.
 */
const PLATFORMS = {
  threads: { publish: publishToThreads, requiresMedia: false },
  facebook: { publish: publishToFacebook, requiresMedia: false },
  instagram: { publish: publishToInstagram, requiresMedia: true }
};

module.exports = { PLATFORMS };
