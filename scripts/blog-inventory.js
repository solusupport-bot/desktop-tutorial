#!/usr/bin/env node
// 블로그 발행 재고 = 아직 블로그 글이 없는 주제 중 checkPublishable을 통과한 사전 작성 글 수.
// sync-blog-posts.js가 실행 끝에 세는 것과 같은 기준이다. 재고가 3건 이하면 4건을 채운다는
// 규칙(CLAUDE.md 📰)을 예약 작업이 판단할 때 쓴다. 출력 마지막 줄: INVENTORY=<n>
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { loadTopicSlugs } = require('../lib/ingestion/topic_blog_links');
const { blogContentQueue } = require('../lib/scheduler/prewritten_content');
const { checkPublishable } = require('../lib/publishing/blog_quality');

const main = async () => {
  const slugs = loadTopicSlugs();
  const topics = await fetchKoreaTravelTopics();
  const ready = topics.filter((t) => {
    const q = blogContentQueue.get(t.source);
    return !slugs[t.source] && q && checkPublishable(q).length === 0;
  });
  ready.forEach((t) => console.log(`- ${t.source}`));
  console.log(`INVENTORY=${ready.length}`);
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
