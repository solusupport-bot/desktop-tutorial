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
const pickFaqSentences = (allSentences) => {
  const mistake = allSentences.find((s) => /mistake|miss(es)?|surpris/i.test(s)) || allSentences[0];
  const before = allSentences.find((s) => s !== mistake) || allSentences[1] || allSentences[0];
  const tip = [...allSentences].reverse().find((s) => s !== mistake && s !== before)
    || allSentences[allSentences.length - 1] || allSentences[0];
  return { mistake, before, tip };
};

const buildFallbackFaq = (topic, faqSentences) => [
  { question: `What's the most common first-timer mistake with ${topic.source.toLowerCase()}?`, answer: faqSentences.mistake },
  { question: `What should I know before I go?`, answer: faqSentences.before },
  { question: `Any quick tip to remember?`, answer: faqSentences.tip }
];

// 2026-09-13: 애드센스가 "중복 코드/콘텐츠"로 반려한 원인 두 가지를 여기서 고친다 —
// (1) 폴백 글 16개 중 다수가 제목/소제목이 토씨 하나 안 틀리고 똑같았다(전부
// "${topic}: What First-Timers Actually Need to Know" + "## The short version") —
// 주제 이름으로 안정적인 해시를 내 템플릿을 고정 로테이션한다(재생성해도 같은 주제는
// 같은 제목 유지). (2) FAQ 답변이 본문 문장을 그대로 복붙해 같은 문장이 한 페이지에
// 두 번 나왔다 — FAQ에 쓴 문장은 본문에서 빼서 문장이 겹치지 않게 한다(새 사실을
// 지어내진 않음, 같은 사실을 본문/FAQ에 한 번씩만 배치).
const FALLBACK_TITLE_TEMPLATES = [
  (t) => `${t}: What First-Timers Actually Need to Know`,
  (t) => `${t} — The Real First-Timer's Guide`,
  (t) => `${t}: What Actually Matters Before You Go`,
  (t) => `${t} — What Nobody Tells First-Timers`
];
const FALLBACK_HEADING_TEMPLATES = [
  'The short version', 'What you actually need to know', 'The practical rundown', 'What matters here'
];
const hashIndex = (str, mod) => {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
};

// 2026-09-12: 메타 설명에 애드센스/SEO 관점의 혜택 키워드를 넣어달라는 요청 —
// 사실을 지어내는 게 아니라 이미 검증된 firstSentence 뒤에 짧은 혜택 문구만 붙인다.
// Land in Korea는 영어 콘텐츠라 문서 예시(무료/꿀팁/필수 정보)를 영어로 대응시킨다.
// 붙였을 때 155자를 넘기면(문장이 이미 길면) 억지로 자르지 않고 원문만 쓴다.
const BLOG_DESCRIPTION_BENEFIT_SUFFIX = ' Free, essential tips inside.';
const buildBlogDescription = (firstSentence) => {
  const withSuffix = `${firstSentence} ${BLOG_DESCRIPTION_BENEFIT_SUFFIX.trim()}`;
  return (withSuffix.length <= 155 ? withSuffix : firstSentence).slice(0, 155);
};

const buildFallbackPost = (topic) => {
  const angles = Array.isArray(topic.content) ? topic.content : [topic.content];
  const allSentences = angles.flatMap(splitSentences);
  const faqSentences = pickFaqSentences(allSentences);
  const usedInFaq = new Set(Object.values(faqSentences));
  const bodyAngles = angles.map((angle) => {
    const kept = splitSentences(angle).filter((s) => !usedInFaq.has(s));
    return kept.length ? kept.join(' ') : angle.trim(); // 문단 전체가 FAQ로 빠지는 것 방지
  });
  const body = bodyAngles.join('\n\n');
  const firstSentence = (angles[0].match(/[^.!?]+[.!?]/) || [angles[0]])[0].trim();
  const title = FALLBACK_TITLE_TEMPLATES[hashIndex(topic.source, FALLBACK_TITLE_TEMPLATES.length)](topic.source);
  const heading = FALLBACK_HEADING_TEMPLATES[hashIndex(`${topic.source}:heading`, FALLBACK_HEADING_TEMPLATES.length)];
  return {
    title,
    description: buildBlogDescription(firstSentence),
    body: `## ${heading}\n\n${body}`,
    image_query: `${topic.source} travel`,
    faq: buildFallbackFaq(topic, faqSentences)
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

The description must naturally include at least one benefit-oriented SEO keyword (e.g. "free", "essential", "tips", "guide") — still under 160 characters, still a real sentence, not keyword-stuffed.

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

// 2026-09-11 사용자 요청: "매일 블로그 글이 중복없이 올라가도록" — 한 번의 실행에서
// 블로그 글 없는 주제를 발견하는 대로 전부 다 써버리면(예: 새 주제 8개를 한꺼번에
// 추가한 경우), 그 날 하루에 8건이 몰리고 그 다음엔 며칠~몇 주씩 새 글이 하나도
// 안 나가는 불규칙한 패턴이 생긴다. 하루 실행당 딱 1건만 쓰도록 캡을 둬서, 새 주제를
// 한꺼번에 추가해도 매일 꾸준히 1건씩 나가게 한다.
const MAX_NEW_POSTS_PER_RUN = 1;

// 최소 이 개수 밑으로 "아직 블로그 글 없는 주제"가 줄어들면, 매일 발행이 곧 끊긴다는
// 뜻이므로 다음 실행 로그에서 눈에 띄게 경고한다 — 다음 세션에서 korea_travel.js에
// 새 주제를 추가해야 한다는 신호.
const LOW_BACKLOG_WARNING_THRESHOLD = 3;

const main = async () => {
  log.section('Land in Korea 블로그 글 동기화 (SNS 주제 <-> 블로그 글)');
  const topics = await fetchKoreaTravelTopics();
  const slugs = loadTopicSlugs();
  let created = 0;

  const pending = topics.filter((t) => !slugs[t.source]);

  for (const topic of pending) {
    if (created >= MAX_NEW_POSTS_PER_RUN) break;

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
    if (pending.length === 0) {
      log.ok('모든 SNS 주제가 이미 블로그 글과 연결되어 있습니다. 새로 쓸 글 없음.');
    } else {
      log.err(`블로그 글이 필요한 주제 ${pending.length}건이 있었지만 이번 실행에서 하나도 푸시하지 못했습니다 — 다음 실행에서 재시도합니다.`);
    }
  } else {
    log.ok(`새 블로그 글 ${created}건 land-in-korea-blog에 푸시 완료 — blog-build.yml이 이어서 이미지까지 채워 배포합니다.`);
  }

  const remaining = pending.length - created;
  if (remaining <= LOW_BACKLOG_WARNING_THRESHOLD) {
    log.warn(`아직 블로그 글 없는 주제가 ${remaining}건밖에 안 남았습니다 — 매일 발행이 곧 끊깁니다. korea_travel.js(SOURCES)에 새 주제를 추가해야 합니다.`);
  } else {
    log.ok(`블로그 글 대기 중인 신규 주제 재고: ${remaining}건 (약 ${remaining}일 분량)`);
  }
};

main().catch((err) => {
  log.err(`블로그 글 동기화 실패: ${err.message}`);
  process.exit(1);
});
