const fs = require('fs');
const axios = require('axios');
const log = require('../logger');

const GITHUB_API = 'https://api.github.com';

/**
 * Meta Graph API(Facebook file_url / Instagram image_url,video_url)는 공개적으로
 * 접근 가능한 URL을 요구합니다. Pexels 원본은 이미 공개 URL이라 그대로 넘기면 됐지만,
 * 워터마크를 합성한 이미지나 음악을 합성한 영상처럼 우리가 새로 만든 파일은 직접
 * 어딘가에 호스팅해야 합니다. 별도 스토리지를 두지 않고, 이 저장소의 GitHub Release
 * 자산으로 올려 그 공개 다운로드 URL을 씁니다(공개 저장소의 release asset은 토큰
 * 없이도 누구나 접근 가능).
 *
 * 한 번의 실행(게시물 1건, 캐로셀이면 이미지 여러 장)에서 나오는 자산들은 릴리스를
 * 하나만 만들어 그 안에 다 같이 올립니다 — 이미지마다 릴리스를 새로 만들면 Releases
 * 탭이 금방 지저분해지기 때문입니다.
 */
const createMediaRelease = async (repoFullName, githubToken) => {
  const [owner, repo] = repoFullName.split('/');
  const tag = `media-${Date.now()}`;
  const headers = { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json' };

  const release = await axios.post(`${GITHUB_API}/repos/${owner}/${repo}/releases`, {
    tag_name: tag,
    name: `Media asset ${tag}`,
    body: '자동 발행 파이프라인이 가공된 이미지/영상을 임시 호스팅하기 위해 생성한 릴리스입니다. 삭제해도 무방합니다.',
    draft: false,
    prerelease: true
  }, { headers, timeout: 20000 });

  return { uploadUrl: release.data.upload_url.replace('{?name,label}', ''), headers };
};

/** buffer 또는 파일 경로를 release에 자산으로 올리고 공개 다운로드 URL을 반환합니다. */
const uploadAsset = async (release, bufferOrPath, assetName, contentType) => {
  const fileBuffer = Buffer.isBuffer(bufferOrPath) ? bufferOrPath : fs.readFileSync(bufferOrPath);

  const asset = await axios.post(release.uploadUrl, fileBuffer, {
    headers: { ...release.headers, 'Content-Type': contentType, 'Content-Length': fileBuffer.length },
    params: { name: assetName },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000
  });

  return asset.data.browser_download_url;
};

/** 영상 하나만 올릴 때 쓰는 기존 편의 함수(릴리스 생성 + 업로드를 한 번에). */
const uploadMergedVideoAsset = async (repoFullName, githubToken, filePath, assetName) => {
  const release = await createMediaRelease(repoFullName, githubToken);
  const url = await uploadAsset(release, filePath, assetName, 'video/mp4');
  log.ok(`합성 영상을 GitHub Release 자산으로 호스팅: ${url}`);
  return url;
};

module.exports = { createMediaRelease, uploadAsset, uploadMergedVideoAsset };
