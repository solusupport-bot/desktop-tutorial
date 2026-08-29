const axios = require('axios');
const log = require('../logger');

const GITHUB_API = 'https://api.github.com';
const MEDIA_BRANCH = 'media-assets';

/**
 * GitHub Release 자산(objects.githubusercontent.com로 리다이렉트)으로 워터마크 이미지를
 * 호스팅했더니 Threads가 간헐적으로 그 URL을 못 가져왔다(2026-08-29 실측 — 같은 파이프라인이
 * 같은 날 3번 성공, 2번은 매번 다른 OAuthException 코드로 실패. 리다이렉트/서명 URL을
 * "브라우저처럼 보이지 않는" 요청이 가끔 거부당하는 GitHub CDN의 알려진 특성으로 추정).
 *
 * 대신 이 저장소의 media-assets 브랜치(소스 코드와 무관한 별도 브랜치, 최초 1회 생성해둠)에
 * GitHub Contents API로 파일을 직접 커밋하고, raw.githubusercontent.com URL로 서빙한다.
 * 이 CDN은 README 이미지, shields.io 배지 등으로 전 세계에서 매일 수십억 번 비-브라우저
 * 요청으로 직접 히트되는 경로라 리다이렉트/서명 토큰 없이 안정적이다.
 */
const uploadMediaFile = async (repoFullName, githubToken, buffer, relativePath) => {
  const [owner, repo] = repoFullName.split('/');
  const headers = { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json' };

  await axios.put(`${GITHUB_API}/repos/${owner}/${repo}/contents/${relativePath}`, {
    message: `chore: host media asset ${relativePath}`,
    content: buffer.toString('base64'),
    branch: MEDIA_BRANCH
  }, { headers, timeout: 30000, maxBodyLength: Infinity, maxContentLength: Infinity });

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${MEDIA_BRANCH}/${relativePath}`;
  log.ok(`미디어를 raw.githubusercontent.com으로 호스팅: ${rawUrl}`);
  return rawUrl;
};

module.exports = { uploadMediaFile, MEDIA_BRANCH };
