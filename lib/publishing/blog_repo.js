const axios = require('axios');
const log = require('../logger');

// 2026-11-01부터 블로그 원격저장소는 GitLab 하나만 쓴다. 이 파일이 GitHub로 푸시하던 동안
// 자동 글 작성이 인증 오류로 매일 실패했다. BLOG_REPO_PAT은 GitLab 토큰(api 스코프)이어야 한다.
const GITLAB_PROJECT = encodeURIComponent('land-in-korea/land-in-korea-blog');
const GITLAB_API = `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT}/repository`;
const BLOG_BASE_URL = 'https://landinkorea.com';

const authHeaders = () => ({ 'PRIVATE-TOKEN': process.env.BLOG_REPO_PAT });

const listSlugsIn = async (dir) => {
  const slugs = [];
  let page = 1;
  while (page) {
    const { data, headers } = await axios.get(`${GITLAB_API}/tree`, {
      headers: authHeaders(),
      params: { path: dir, per_page: 100, page }
    });
    data.filter((f) => f.name.endsWith('.md')).forEach((f) => slugs.push(f.name.replace(/\.md$/, '')));
    page = Number(headers['x-next-page']) || 0;
  }
  return slugs;
};

/**
 * 2026-09-17 실측 버그: data/topic_blog_links.json에 slug만 있고 실제 파일이 없는 "유령 링크"
 * 6개 때문에 새 글이 안 써졌다. 링크 맵만 믿지 말고 실제 파일을 확인한다. 발행 대기 중인 글을
 * 다시 쓰지 않도록 drafts도 함께 본다.
 */
const listExistingSlugs = async () => {
  if (!process.env.BLOG_REPO_PAT) return null;
  try {
    const [posts, drafts] = await Promise.all([listSlugsIn('content/posts'), listSlugsIn('content/drafts')]);
    return new Set([...posts, ...drafts]);
  } catch (err) {
    log.warn(`블로그 저장소 글 목록 조회 실패, 링크 맵만 신뢰합니다: ${err.response?.data?.message || err.message}`);
    return null;
  }
};

/**
 * 글을 content/drafts/에 넣는다. 발행은 GitLab CI의 publish_queue.py가 하루 상한 안에서 맡는다.
 * 애드센스 거절 사유였던 몰아 올리기를 막기 위해 content/posts/에 직접 넣지 않는다.
 */
const pushBlogPost = async ({ slug, markdown }) => {
  if (!process.env.BLOG_REPO_PAT) throw new Error('BLOG_REPO_PAT이 없어 블로그 글을 저장할 수 없습니다.');
  const filePath = encodeURIComponent(`content/drafts/${slug}.md`);
  await axios.post(
    `${GITLAB_API}/files/${filePath}`,
    { branch: 'main', content: markdown, commit_message: `chore: queue draft ${slug}` },
    { headers: authHeaders() }
  );
  const url = `${BLOG_BASE_URL}/posts/${slug}.html`;
  log.ok(`블로그 초안 저장 완료, 다음 발행 실행에서 공개됩니다: ${url}`);
  return url;
};

module.exports = { pushBlogPost, listExistingSlugs, BLOG_BASE_URL };
