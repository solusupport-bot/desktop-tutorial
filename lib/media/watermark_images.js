const { applyWatermark } = require('./watermark');
const { createMediaRelease, uploadAsset } = require('../publishing/github_asset_host');
const log = require('../logger');

/**
 * 이미지 URL 목록을 워터마크 합성 -> GitHub Release 자산으로 호스팅 -> 새 공개 URL로
 * 바꿔 반환합니다. 한 게시물(캐로셀 여러 장 포함)에서 나오는 자산은 릴리스 하나에
 * 같이 올립니다. GITHUB_TOKEN이 없거나 개별 이미지 처리가 실패하면 그 이미지는
 * 원본 Pexels URL 그대로 반환합니다(워터마크 없이 발행하는 게 아예 안 올리는 것보다
 * 낫다는 기존 원칙과 동일).
 */
const watermarkAndHostImages = async (imageUrls, repoFullName, githubToken) => {
  if (!imageUrls.length) return imageUrls;
  if (!githubToken) {
    log.warn('GITHUB_TOKEN이 없어 워터마크 합성을 건너뜁니다(원본 이미지 그대로 사용).');
    return imageUrls;
  }

  let release;
  try {
    release = await createMediaRelease(repoFullName, githubToken);
  } catch (err) {
    log.err(`워터마크 호스팅용 릴리스 생성 실패: ${err.response?.data?.message || err.message}`);
    return imageUrls;
  }

  const results = [];
  for (let i = 0; i < imageUrls.length; i += 1) {
    const original = imageUrls[i];
    try {
      const buffer = await applyWatermark(original);
      if (!buffer) {
        results.push(original);
        continue;
      }
      const url = await uploadAsset(release, buffer, `watermarked-${Date.now()}-${i}.jpg`, 'image/jpeg');
      log.ok(`워터마크 이미지 호스팅: ${url}`);
      results.push(url);
    } catch (err) {
      log.err(`이미지 워터마크/호스팅 실패, 원본 사용: ${err.message}`);
      results.push(original);
    }
  }
  return results;
};

module.exports = { watermarkAndHostImages };
