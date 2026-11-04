#!/usr/bin/env node
// SNS 파이프라인(korea_travel.js)에 있는 모든 주제 각각에 대해 실제 블로그 글이
// 있는지 확인하고, 없으면 새로 써서 land-in-korea-blog 저장소에 직접 푸시합니다.
// korea_travel.js에 새 주제가 추가되기만 하면 사람이 따로 글을 쓰지 않아도 다음 날
// 자동으로 블로그 글이 생기고 SNS 링크가 그 글로 연결됩니다
// (data/topic_blog_links.json이 주제<->slug 연결 상태를 기록합니다).
//
// 2026-08-29 이전엔 이 스크립트가 land-in-korea-blog가 별도 저장소로 분리되기 전의
// 로컬 경로(desktop-tutorial/land-in-korea-blog/content/posts)에 글을 쓰도록 되어
// 있었습니다 — 분리 이후로는 그 경로가 실제 사이트와 완전히 무관한 죽은 폴더였는데도,
// topic_blog_links.json엔 이미 12개 주제 전부의 slug가 기록돼 있고 그 로컬 폴더에도
// 마이그레이션 이전에 쓰인 파일이 그대로 남아있어서 "이미 다 있음"으로 착각하고 매번
// 아무 것도 안 하고 있었습니다. 이제 land-in-korea-blog(lib/publishing/blog_repo.js
// 경유, BLOG_REPO_PAT 필요)에 직접 푸시합니다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { loadTopicSlugs, saveTopicSlugs } = require('../lib/ingestion/topic_blog_links');
const { pushBlogPost, listExistingSlugs } = require('../lib/publishing/blog_repo');
const { blogContentQueue } = require('../lib/scheduler/prewritten_content');
const { checkPostQuality, checkReviews, checkPublishable } = require('../lib/publishing/blog_quality');
const { addReviews } = require('../lib/publishing/ai_review');

// 알려진 12개 주제의 카테고리는 사람이 직접 정한 값을 그대로 쓰고, 앞으로
// korea_travel.js에 새 주제가 추가되면 키워드 기반으로 적당한 카테고리를 추정합니다.
const KNOWN_CATEGORIES = {
  'Airport transfer options': 'Comparisons',
  'eSIM & mobile data': 'Comparisons',
  'T-money transit card': 'Etiquette & mistakes',
  'Tax refund (Tax Free) shopping': 'Money-saving',
  'Travel advisories & safety notices': 'Practical info',
  'First-timer etiquette & common mistakes': 'Etiquette & mistakes',
  'Currency & card payments': 'Money-saving',
  'Emergency numbers & 24hr pharmacies': 'Practical info',
  'Useful travel apps': 'Comparisons',
  'Convenience store hacks': 'Money-saving',
  'Seasonal packing & weather tips': 'Practical info',
  'Luggage storage & forwarding services': 'Airport & transit'
};

const guessCategory = (topicName) => {
  if (KNOWN_CATEGORIES[topicName]) return KNOWN_CATEGORIES[topicName];
  const t = topicName.toLowerCase();
  if (/mistake|etiquette/.test(t)) return 'Etiquette & mistakes';
  if (/airport|transit|luggage|transfer/.test(t)) return 'Airport & transit';
  if (/money|tax|currency|card|store|refund/.test(t)) return 'Money-saving';
  if (/app|esim|option|vs\.?|compar/.test(t)) return 'Comparisons';
  return 'Practical info';
};

const slugify = (topicName) => `korea-${topicName
  .toLowerCase()
  .replace(/[()&]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')}`;

// 실제 사용자 질문에 답하는 형식의 콘텐츠는 애드센스 심사에서 "실질적인 가치가 있는
// 콘텐츠"로 유리하게 작용한다(2026-08-31 사용자 요청). faq가 없으면(과거 글, 또는
// 생성 실패) 섹션 자체를 생략한다 — 빈 섹션을 억지로 넣지 않는다.
const buildFaqSection = (faq) => {
  if (!Array.isArray(faq) || !faq.length) return '';
  const items = faq.map((item) => `### ${item.question}\n\n${item.answer}`).join('\n\n');
  return `\n\n## Frequently Asked Questions\n\n${items}`;
};

const buildMarkdown = (slug, category, generated) => {
  const frontMatter = [
    '---',
    `title: ${generated.title.replace(/:/g, ' -')}`,
    `date: ${new Date().toISOString().slice(0, 10)}`,
    `category: ${category}`,
    `description: ${generated.description.replace(/\n/g, ' ')}`,
    `slug: ${slug}`,
    `image_query: ${generated.image_query}`,
    '---',
    ''
  ].join('\n');
  return frontMatter + generated.body.trim() + buildFaqSection(generated.faq) + '\n';
};

// 2026-09-11 사용자 요청: "매일 블로그 글이 중복없이 올라가도록" — 한 번의 실행에서
// 블로그 글 없는 주제를 발견하는 대로 전부 다 써버리면(예: 새 주제 8개를 한꺼번에
// 추가한 경우), 그 날 하루에 8건이 몰리고 그 다음엔 며칠~몇 주씩 새 글이 하나도
// 안 나가는 불규칙한 패턴이 생긴다. 하루 실행당 딱 1건만 쓰도록 캡을 둬서, 새 주제를
// 한꺼번에 추가해도 매일 꾸준히 1건씩 나가게 한다.
// 2026-10-10 사용자 요청: 하루 2건.
const MAX_NEW_POSTS_PER_RUN = 2;

// 최소 이 개수 밑으로 "아직 블로그 글 없는 주제"가 줄어들면, 매일 발행이 곧 끊긴다는
// 뜻이므로 다음 실행 로그에서 눈에 띄게 경고한다 — 다음 세션에서 korea_travel.js에
// 새 주제를 추가해야 한다는 신호.
const LOW_BACKLOG_WARNING_THRESHOLD = 3;

const main = async () => {
  log.section('Land in Korea 블로그 글 동기화 (SNS 주제 <-> 블로그 글)');
  const topics = await fetchKoreaTravelTopics();
  const slugs = loadTopicSlugs();
  let created = 0;

  // 링크 맵에 slug가 있다고 실제 파일이 있다는 보장이 없다(유령 링크 버그, 위
  // blog_repo.js 주석 참고) — 저장소 API로 진짜 파일 목록을 확인해 교차 검증한다.
  // API 조회 자체가 실패하면(오프라인 등) 기존처럼 링크 맵만 믿는다.
  const existingSlugs = await listExistingSlugs();
  const pending = topics.filter((t) => {
    if (!slugs[t.source]) return true;
    if (existingSlugs && !existingSlugs.has(slugs[t.source])) {
      log.warn(`"${t.source}"는 링크(${slugs[t.source]})만 있고 실제 글 파일이 없습니다 — 다시 씁니다.`);
      return true;
    }
    return false;
  });

  for (const topic of pending) {
    if (created >= MAX_NEW_POSTS_PER_RUN) break;

    log.warn(`블로그 글 없음: "${topic.source}" — 새로 작성합니다.`);
    const slug = slugify(topic.source);
    const category = guessCategory(topic.source);

    // 2026-09-23: 자동 실행 중엔 글을 쓰지 않는다. Claude Code 세션에서 작성 + 독립 검수 2회
    // (blog_quality.js checkReviews)까지 통과한 사전 작성 글만 발행한다(크레딧 소진 시 템플릿 글이
    // "성공"으로 나간 사고 재발 방지). 없거나 기준 미달이면 그 주제는 건너뛴다.
    // 2026-09-24: 검수는 Groq 무료 모델 2개가 여기서 한다(ai_review.js) — 규칙 게이트를 통과한 글만.
    let generated = blogContentQueue.get(topic.source);
    if (!generated) {
      log.warn(`"${topic.source}": 사전 작성 글 없음 — 건너뜀.`);
      continue;
    }
    if (!checkPostQuality(generated).length && checkReviews(generated).length) {
      const existingPosts = Object.entries(blogContentQueue.load()).filter(([k]) => slugs[k]).map(([, v]) => v);
      generated = await addReviews(generated, { existingPosts }, (err) => log.warn(`"${topic.source}" 검수 보류: ${err.message}`));
      blogContentQueue.set(topic.source, generated);
    }
    const problems = checkPublishable(generated);
    if (problems.length) {
      const issues = (generated.reviews || []).filter((r) => !r.pass).flatMap((r) => r.issues || []);
      log.err(`"${topic.source}" 발행 차단: ${[...problems, ...issues].join(', ')}`);
      continue;
    }
    log.ok(`검수 완료된 사전 작성 글 사용 (${topic.source})`);

    const markdown = buildMarkdown(slug, category, generated);
    const url = await pushBlogPost({ slug, markdown });
    if (!url) {
      log.err(`"${topic.source}" 블로그 글 푸시 실패 — 다음 실행에서 다시 시도합니다.`);
      continue;
    }

    slugs[topic.source] = slug;
    saveTopicSlugs(slugs);
    created += 1;
    log.ok(`작성 완료: ${url} (${category})`);
  }

  if (created === 0) {
    if (pending.length === 0) {
      log.ok('모든 SNS 주제가 이미 블로그 글과 연결되어 있습니다. 새로 쓸 글 없음.');
    } else {
      log.err(`블로그 글이 필요한 주제 ${pending.length}건이 있었지만 이번 실행에서 하나도 푸시하지 못했습니다 — 다음 실행에서 재시도합니다.`);
      // 조용한 "성공" 대신 워크플로를 빨간불로 — 다음 커밋 스텝들은 이미 앞 단계에서 끝났으므로 영향 없음.
      process.exitCode = 1;
    }
  } else {
    log.ok(`새 블로그 글 ${created}건 land-in-korea-blog에 푸시 완료 — blog-build.yml이 이어서 이미지까지 채워 배포합니다.`);
  }

  // 재고 = "주제만 있는 것"이 아니라 "기준을 통과한 사전 작성 글이 준비된 것"만 센다.
  // 주제 수만 세던 예전 방식은 9일 치 재고라고 보고하면서 실제로는 템플릿 글만 내보냈다.
  const remaining = pending.filter((t) => {
    const q = blogContentQueue.get(t.source);
    return q && !slugs[t.source] && checkPublishable(q).length === 0;
  }).length;
  if (remaining <= LOW_BACKLOG_WARNING_THRESHOLD) {
    log.warn(`발행 가능한 사전 작성 글이 ${remaining}건뿐입니다 — 매일 발행이 곧 끊깁니다. data/blog_content_queue.json을 채워야 합니다.`);
  } else {
    log.ok(`발행 가능한 사전 작성 글 재고: ${remaining}건 (약 ${remaining}일 분량)`);
  }
};

main().catch((err) => {
  log.err(`블로그 글 동기화 실패: ${err.message}`);
  process.exit(1);
});
