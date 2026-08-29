const fs = require('fs');
const path = require('path');

// SNS 주제(korea_travel.js의 topic 이름) -> 블로그 글 slug 매핑.
// data/topic_blog_links.json이 실제 데이터고, scripts/sync-blog-posts.js가
// 새 주제에 대한 글을 자동 발행할 때마다 이 파일을 갱신합니다 — 코드를
// 직접 고칠 필요 없이 새 주제가 생겨도 자동으로 연결되게 하기 위함입니다.
const LINKS_PATH = path.join(__dirname, '..', '..', 'data', 'topic_blog_links.json');
// land-in-korea-blog는 2026-08-28에 별도 저장소(solusupport-bot/land-in-korea-blog)로
// 분리되고 커스텀 도메인이 연결되었습니다. 이전 값(desktop-tutorial 내부 경로)은 분리 전
// 잔재로, 실제로는 존재한 적 없는 URL이라 계속 블로그 홈으로만 폴백되고 있었습니다.
const BLOG_BASE = 'https://landinkorea.com';
const BLOG_HOME_URL = `${BLOG_BASE}/index.html`;

const loadTopicSlugs = () => {
  if (!fs.existsSync(LINKS_PATH)) return {};
  return JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8'));
};

const saveTopicSlugs = (slugs) => {
  fs.writeFileSync(LINKS_PATH, `${JSON.stringify(slugs, null, 2)}\n`, 'utf8');
};

/** 주제에 맞는 블로그 글 URL을 반환합니다. 매칭되는 글이 없으면 블로그 홈을 반환합니다. */
const getBlogLinkForTopic = (topic) => {
  const slug = loadTopicSlugs()[topic];
  return slug ? `${BLOG_BASE}/posts/${slug}.html` : BLOG_HOME_URL;
};

/** platform별 클릭 출처를 구분할 수 있도록 UTM 파라미터를 붙입니다. */
const withUtm = (url, platform) => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=${platform}&utm_medium=social&utm_campaign=auto_post`;
};

module.exports = {
  getBlogLinkForTopic,
  withUtm,
  loadTopicSlugs,
  saveTopicSlugs,
  BLOG_BASE,
  BLOG_HOME_URL,
  LINKS_PATH
};
