const { applyWatermark } = require('./watermark');
const { uploadMediaFile } = require('../publishing/media_host');
const log = require('../logger');

/**
 * 이미지 URL 목록을 워터마크 합성 -> landinkorea.com으로 호스팅 -> 새 공개
 * URL로 바꿔 반환합니다(GitHub Release 자산 방식은 Threads가 간헐적으로 못 가져와서
 * 2026-08-29에 raw 방식으로 교체, 2026-09-25 landinkorea.com으로 이전 — media_host.js 주석 참고).
 * 워터마크 합성이나 공개 호스팅이 실패한 이미지는 목록에서 완전히 뺍니다. Land in
 * Korea 이미지 게시물은 항상 브랜드 워터마크가 있어야 하므로 원본 이미지로 대체하지
 * 않습니다. 다운로드 자체가 실패한 이미지도 동일하게 제외합니다 —
 * 2026-09-13 실측: 다운로드도 안 되는 URL을 "원본 그대로"로 앨범에 넣으면 발행
 * 시점에 Meta도 똑같이 못 가져와 그 게시물 전체가 재시도해도 계속 실패했다.
 */
const watermarkAndHostImages = async (imageUrls, repoFullName, githubToken, { portrait = false } = {}) => {
  if (!imageUrls.length) return imageUrls;

  const runId = Date.now();
  const results = [];
  for (let i = 0; i < imageUrls.length; i += 1) {
    const original = imageUrls[i];
    try {
      const { buffer, downloadFailed } = await applyWatermark(original, { portrait });
      if (downloadFailed) {
        log.warn(`다운로드 실패한 이미지를 앨범에서 제외: ${original}`);
        continue;
      }
      if (!buffer) {
        log.warn(`워터마크를 적용하지 못한 이미지를 제외: ${original}`);
        continue;
      }
      const url = await uploadMediaFile(buffer, `images/${runId}-${i}.jpg`);
      results.push(url);
    } catch (err) {
      log.err(`이미지 워터마크/호스팅 실패로 이미지 제외: ${err.response?.data?.message || err.message}`);
    }
  }
  return results;
};

module.exports = { watermarkAndHostImages };
