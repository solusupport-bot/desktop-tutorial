const fs = require('fs');
const axios = require('axios');
const log = require('../logger');

const GITHUB_API = 'https://api.github.com';

/**
 * Meta Graph API(Facebook file_url / Instagram video_url)는 공개적으로 접근 가능한
 * URL을 요구합니다. Pexels 원본 영상은 이미 공개 URL이라 그대로 넘기면 됐지만, 음악을
 * 합성한 새 mp4 파일은 우리가 직접 어딘가에 호스팅해야 합니다. 별도 스토리지를 새로
 * 두지 않고, 이 저장소의 GitHub Release 자산으로 올려 그 공개 다운로드 URL을 씁니다
 * (공개 저장소의 release asset은 토큰 없이도 누구나 접근 가능).
 * 실행마다 새 태그로 릴리스를 만들어 자산을 하나만 올립니다.
 */
const uploadMergedVideoAsset = async (repoFullName, githubToken, filePath, assetName) => {
  const [owner, repo] = repoFullName.split('/');
  const tag = `media-${Date.now()}`;
  const headers = { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json' };

  const release = await axios.post(`${GITHUB_API}/repos/${owner}/${repo}/releases`, {
    tag_name: tag,
    name: `Media asset ${tag}`,
    body: '자동 발행 파이프라인이 음악 합성 영상을 임시 호스팅하기 위해 생성한 릴리스입니다. 삭제해도 무방합니다.',
    draft: false,
    prerelease: true
  }, { headers, timeout: 20000 });

  const uploadUrl = release.data.upload_url.replace('{?name,label}', '');
  const fileBuffer = fs.readFileSync(filePath);

  const asset = await axios.post(uploadUrl, fileBuffer, {
    headers: { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': fileBuffer.length },
    params: { name: assetName },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000
  });

  log.ok(`합성 영상을 GitHub Release 자산으로 호스팅: ${asset.data.browser_download_url}`);
  return asset.data.browser_download_url;
};

module.exports = { uploadMergedVideoAsset };
