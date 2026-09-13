const { applyWatermark } = require('./watermark');
const { uploadMediaFile } = require('../publishing/github_raw_host');
const log = require('../logger');

/**
 * 이미지 URL 목록을 워터마크 합성 -> raw.githubusercontent.com으로 호스팅 -> 새 공개
 * URL로 바꿔 반환합니다(GitHub Release 자산 방식은 Threads가 간헐적으로 못 가져와서
 * 2026-08-29에 raw 방식으로 교체 — github_raw_host.js 주석 참고).
 * GITHUB_TOKEN이 없거나 워터마크 합성만 실패하면(다운로드는 성공) 그 이미지는 원본
 * URL 그대로 반환합니다(워터마크 없이 발행하는 게 아예 안 올리는 것보다 낫다는 기존
 * 원칙과 동일). 반면 다운로드 자체가 실패한 이미지는 목록에서 완전히 뺍니다 —
 * 2026-09-13 실측: 다운로드도 안 되는 URL을 "원본 그대로"로 앨범에 넣으면 발행
 * 시점에 Meta도 똑같이 못 가져와 그 게시물 전체가 재시도해도 계속 실패했다.
 */
const watermarkAndHostImages = async (imageUrls, repoFullName, githubToken) => {
  if (!imageUrls.length) return imageUrls;
  if (!githubToken) {
    log.warn('GITHUB_TOKEN이 없어 워터마크 합성을 건너뜁니다(원본 이미지 그대로 사용).');
    return imageUrls;
  }

  const runId = Date.now();
  const results = [];
  for (let i = 0; i < imageUrls.length; i += 1) {
    const original = imageUrls[i];
    try {
      const { buffer, downloadFailed } = await applyWatermark(original);
      if (downloadFailed) {
        log.warn(`다운로드 실패한 이미지를 앨범에서 제외: ${original}`);
        continue;
      }
      if (!buffer) {
        results.push(original);
        continue;
      }
      const url = await uploadMediaFile(repoFullName, githubToken, buffer, `images/${runId}-${i}.jpg`);
      results.push(url);
    } catch (err) {
      log.err(`이미지 워터마크/호스팅 실패, 원본 사용: ${err.response?.data?.message || err.message}`);
      results.push(original);
    }
  }
  return results;
};

module.exports = { watermarkAndHostImages };
