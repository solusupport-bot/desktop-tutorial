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
const { pushBlogPost } = require('../lib/publishing/blog_repo');
const { askClaudeForJSON } = require('../lib/ai/claude');
const { blogContentQueue } = require('../lib/scheduler/prewritten_content');

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

const splitSentences = (text) => (text.match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);

/**
 * 템플릿 대체 경로에서도 실질적인 FAQ 3개를 만든다 — 새 사실을 지어내지 않고
 * 이미 검증된 원문 문장을 그대로 답변으로 재사용한다(2026-08-31 사용자 요청: 애드센스
 * 승인에 도움이 되도록 블로그에 Q&A 방식 추가, 질문 3개).
 */
const buildFallbackFaq = (topic) => {
  const angles = Array.isArray(topic.content) ? topic.content : [topic.content];
  const allSentences = angles.flatMap(splitSentences);
  const mistakeSentence = allSentences.find((s) => /mistake|miss(es)?|surpris/i.test(s));
  return [
    { question: `What's the most common first-timer mistake with ${topic.source.toLowerCase()}?`, answer: mistakeSentence || allSentences[0] },
    { question: `What should I know before I go?`, answer: allSentences[1] || allSentences[0] },
    { question: `Any quick tip to remember?`, answer: allSentences[allSentences.length - 1] || allSentences[0] }
  ];
};

const buildFallbackPost = (topic) => {
  const angles = Array.isArray(topic.content) ? topic.content : [topic.content];
  const body = angles.map((a) => a.trim()).join('\n\n');
  const firstSentence = (angles[0].match(/[^.!?]+[.!?]/) || [angles[0]])[0].trim();
  return {
    title: `${topic.source}: What First-Timers Actually Need to Know`,
    description: firstSentence.slice(0, 155),
    body: `## The short version\n\n${body}`,
    image_query: `${topic.source} travel`,
    faq: buildFallbackFaq(topic)
  };
};

const buildWithClaude = async (topic) => {
  const angles = Array.isArray(topic.content) ? topic.content : [topic.content];
  const prompt = `You write for "Land in Korea", an English-language blog for first-time visitors and foreign residents in Korea. Its brand promise is real comparisons and honest specifics, never generic listicles.

Write a full blog post (400-600 words, markdown) about: "${topic.source}"

[Facts you may use — do not invent anything beyond these]
${angles.map((a, i) => `Angle ${i + 1}: ${a}`).join('\n\n')}

Structure: a hook opening (a specific claim, a mistake framing, or a contrarian angle) -> ## headed sections with the real substance -> a practical close.
Only include an affiliate mention using literally {{klook}}, {{tripcom}}, or {{getyourguide}} as a markdown link target if there's a genuine, specific product tie-in (e.g. a bookable tour, transfer, or SIM/pass) — never force one in.

Also write exactly 3 FAQ question/answer pairs using only the facts above (do not invent new facts) — real questions a first-timer would actually search, with a 1-2 sentence answer each.

Respond ONLY with this JSON shape (no explanation, no code fences):
{"title": "...", "description": "...(under 160 chars, no quotes)", "body": "...(the markdown body, starting from the hook, no title heading)", "image_query": "...(2-5 words, a concrete visual scene)", "faq": [{"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}]}`;

  return askClaudeForJSON(prompt);
};

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

const main = async () => {
  log.section('Land in Korea 블로그 글 동기화 (SNS 주제 <-> 블로그 글)');
  const topics = await fetchKoreaTravelTopics();
  const slugs = loadTopicSlugs();
  let created = 0;

  for (const topic of topics) {
    if (slugs[topic.source]) continue;

    log.warn(`블로그 글 없음: "${topic.source}" — 새로 작성합니다.`);
    const slug = slugify(topic.source);
    const category = guessCategory(topic.source);

    // 우선순위: 미리 써둔 큐(대화형 세션에서 API 과금 없이 작성) -> Claude 실시간 호출(키가
    // 있을 때만) -> 템플릿. daily-topic.yml에는 ANTHROPIC_API_KEY를 넣지 않으므로 자동
    // 실행 중엔 큐 아니면 템플릿만 쓰인다(2026-08-30, curate.js와 동일한 방침).
    let generated = blogContentQueue.get(topic.source);
    if (generated) {
      log.ok(`사전 작성된 블로그 글 사용 (${topic.source}, API 호출 없음)`);
    } else {
      try {
        generated = await buildWithClaude(topic);
        if (!generated) {
          log.warn('ANTHROPIC_API_KEY가 없어 템플릿으로 대체합니다.');
          generated = buildFallbackPost(topic);
        }
      } catch (err) {
        log.err(`Claude 글 생성 실패 (${topic.source}): ${err.message}. 템플릿으로 대체합니다.`);
        generated = buildFallbackPost(topic);
      }
    }

    const markdown = buildMarkdown(slug, category, generated);
    const url = pushBlogPost({ slug, markdown });
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
    log.ok('모든 SNS 주제가 이미 블로그 글과 연결되어 있습니다. 새로 쓸 글 없음.');
  } else {
    log.ok(`새 블로그 글 ${created}건 land-in-korea-blog에 푸시 완료 — blog-build.yml이 이어서 이미지까지 채워 배포합니다.`);
  }
};

main().catch((err) => {
  log.err(`블로그 글 동기화 실패: ${err.message}`);
  process.exit(1);
});
