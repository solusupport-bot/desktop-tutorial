#!/usr/bin/env node
// SNS 파이프라인(korea_travel.js)에 있는 모든 주제 각각에 대해 실제 블로그 글이
// 있는지 확인하고, 없으면 새로 써서 발행 큐에 태웁니다. daily-topic.yml이
// 매일 이 스크립트를 실행하므로, korea_travel.js에 새 주제가 추가되기만 하면
// 사람이 따로 글을 쓰지 않아도 다음 날 자동으로 블로그 글이 생기고 SNS 링크가
// 그 글로 연결됩니다 (data/topic_blog_links.json이 연결 상태를 기록합니다).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { loadTopicSlugs, saveTopicSlugs } = require('../lib/ingestion/topic_blog_links');

const POSTS_DIR = path.join(__dirname, '..', 'land-in-korea-blog', 'content', 'posts');

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

const slugify = (topicName) => {
  const base = topicName
    .toLowerCase()
    .replace(/[()&]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let slug = `korea-${base}`;
  let n = 2;
  while (fs.existsSync(path.join(POSTS_DIR, `${slug}.md`))) {
    slug = `korea-${base}-${n}`;
    n += 1;
  }
  return slug;
};

const buildFallbackPost = (topic) => {
  const angles = Array.isArray(topic.content) ? topic.content : [topic.content];
  const body = angles.map((a) => a.trim()).join('\n\n');
  const firstSentence = (angles[0].match(/[^.!?]+[.!?]/) || [angles[0]])[0].trim();
  return {
    title: `${topic.source}: What First-Timers Actually Need to Know`,
    description: firstSentence.slice(0, 155),
    body: `## The short version\n\n${body}`,
    image_query: `${topic.source} travel`
  };
};

const buildWithGemini = async (topic, apiKey) => {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const angles = Array.isArray(topic.content) ? topic.content : [topic.content];
  const prompt = `You write for "Land in Korea", an English-language blog for first-time visitors and foreign residents in Korea. Its brand promise is real comparisons and honest specifics, never generic listicles.

Write a full blog post (400-600 words, markdown) about: "${topic.source}"

[Facts you may use — do not invent anything beyond these]
${angles.map((a, i) => `Angle ${i + 1}: ${a}`).join('\n\n')}

Structure: a hook opening (a specific claim, a mistake framing, or a contrarian angle) -> ## headed sections with the real substance -> a practical close.
Only include an affiliate mention using literally {{klook}}, {{tripcom}}, or {{getyourguide}} as a markdown link target if there's a genuine, specific product tie-in (e.g. a bookable tour, transfer, or SIM/pass) — never force one in.

Respond ONLY with this JSON shape (no explanation, no code fences):
{"title": "...", "description": "...(under 160 chars, no quotes)", "body": "...(the markdown body, starting from the hook, no title heading)", "image_query": "...(2-5 words, a concrete visual scene)"}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.startChat({ history: [] }).sendMessage(prompt);
  const text = result.response.text().trim().replace(/^```json\s*|```$/g, '');
  return JSON.parse(text);
};

const writePost = (slug, topic, category, generated) => {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const frontMatter = [
    '---',
    `title: ${generated.title.replace(/:/g, ' -')}`,
    `date: ${new Date().toISOString().slice(0, 10)}`,
    `category: ${category}`,
    `description: ${generated.description.replace(/\n/g, ' ')}`,
    `image_query: ${generated.image_query}`,
    '---',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(POSTS_DIR, `${slug}.md`), frontMatter + generated.body.trim() + '\n', 'utf8');
};

const main = async () => {
  log.section('Land in Korea 블로그 글 동기화 (SNS 주제 <-> 블로그 글)');
  const topics = await fetchKoreaTravelTopics();
  const slugs = loadTopicSlugs();
  const apiKey = process.env.GEMINI_API_KEY;
  let created = 0;

  for (const topic of topics) {
    const existingSlug = slugs[topic.source];
    const existingFileExists = existingSlug && fs.existsSync(path.join(POSTS_DIR, `${existingSlug}.md`));
    if (existingFileExists) continue;

    log.warn(`블로그 글 없음: "${topic.source}" — 새로 작성합니다.`);
    const slug = slugify(topic.source);
    const category = guessCategory(topic.source);

    let generated;
    if (apiKey) {
      try {
        generated = await buildWithGemini(topic, apiKey);
      } catch (err) {
        log.err(`Gemini 글 생성 실패 (${topic.source}): ${err.message}. 템플릿으로 대체합니다.`);
        generated = buildFallbackPost(topic);
      }
    } else {
      generated = buildFallbackPost(topic);
    }

    writePost(slug, topic, category, generated);
    slugs[topic.source] = slug;
    saveTopicSlugs(slugs);
    created += 1;
    log.ok(`작성 완료: land-in-korea-blog/content/posts/${slug}.md (${category})`);
  }

  if (created === 0) {
    log.ok('모든 SNS 주제가 이미 블로그 글과 연결되어 있습니다. 새로 쓸 글 없음.');
  } else {
    log.ok(`새 블로그 글 ${created}건 작성 완료 — 다음 커밋에 포함되면 빌드 워크플로우가 이미지까지 채워 배포합니다.`);
  }
};

main().catch((err) => {
  log.err(`블로그 글 동기화 실패: ${err.message}`);
  process.exit(1);
});
