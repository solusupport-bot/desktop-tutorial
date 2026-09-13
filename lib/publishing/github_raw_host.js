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
 * 파일을 커밋하고, raw.githubusercontent.com URL로 서빙한다. 이 CDN은 README 이미지,
 * shields.io 배지 등으로 전 세계에서 매일 수십억 번 비-브라우저 요청으로 직접 히트되는
 * 경로라 리다이렉트/서명 토큰 없이 안정적이다.
 *
 * 2026-09-13 실측(음악 합성 영상 테스트 발행 2회 연속 실패 — "Resource not accessible by
 * integration", 그다음 "Server Error"): 기존엔 Contents API(PUT /repos/.../contents/{path})를
 * 썼는데, 이 API는 공식적으로 1MB 이상 파일에는 권장되지 않고(문서: "for files larger than
 * 1MB you must use the Git Database API") 실무에서도 몇 MB만 넘어가면 500 Server Error가
 * 간헐적으로 난다고 알려져 있다. 워터마크 이미지(수백 KB)는 이 한계 아래라 지금까지 문제가
 * 안 보였지만, 배경음악 합성 Reels(1080x1920, 15~30초, H.264)는 보통 5~20MB라 거의 항상
 * 이 한계를 넘는다 — Instagram 배경음악이 무드 매칭과 무관하게 애초에 잘 안 올라갔던
 * 근본 원인이 이것일 가능성이 높다. Git Data API(blob 생성 -> tree -> commit -> ref 갱신)로
 * 교체한다 — 이 경로는 100MB까지 안정적으로 지원된다.
 */
const getBranchHeadSha = async (owner, repo, headers) => {
  const res = await axios.get(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${MEDIA_BRANCH}`,
    { headers, timeout: 15000 }
  );
  return res.data.object.sha;
};

const uploadMediaFile = async (repoFullName, githubToken, buffer, relativePath) => {
  const [owner, repo] = repoFullName.split('/');
  const headers = { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json' };
  const base = `${GITHUB_API}/repos/${owner}/${repo}`;

  const headCommitSha = await getBranchHeadSha(owner, repo, headers);
  const headCommit = await axios.get(`${base}/git/commits/${headCommitSha}`, { headers, timeout: 15000 });
  const baseTreeSha = headCommit.data.tree.sha;

  const blob = await axios.post(`${base}/git/blobs`, {
    content: buffer.toString('base64'),
    encoding: 'base64'
  }, { headers, timeout: 60000, maxBodyLength: Infinity, maxContentLength: Infinity });

  const tree = await axios.post(`${base}/git/trees`, {
    base_tree: baseTreeSha,
    tree: [{ path: relativePath, mode: '100644', type: 'blob', sha: blob.data.sha }]
  }, { headers, timeout: 30000 });

  const commit = await axios.post(`${base}/git/commits`, {
    message: `chore: host media asset ${relativePath}`,
    tree: tree.data.sha,
    parents: [headCommitSha]
  }, { headers, timeout: 30000 });

  await axios.patch(`${base}/git/refs/heads/${MEDIA_BRANCH}`, {
    sha: commit.data.sha
  }, { headers, timeout: 30000 });

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${MEDIA_BRANCH}/${relativePath}`;
  log.ok(`미디어를 raw.githubusercontent.com으로 호스팅: ${rawUrl}`);
  return rawUrl;
};

module.exports = { uploadMediaFile, MEDIA_BRANCH };
