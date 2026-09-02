const { askClaudeForJSON } = require('../ai/claude');
const { snsContentQueue } = require('../scheduler/prewritten_content');
const log = require('../logger');

// "Land in Korea" — 외국인 인바운드 관광객 대상 영어 콘텐츠.
// 주제 범위는 CARD_DESIGN_SPEC.md 기준: eSIM, T-money(교통카드), 세금환급, 관광경보 등
// 한국 첫 방문/체류에 실질적으로 필요한 실용 정보. 제휴처: Klook, Trip.com, GetYourGuide.
const BRAND_TOPICS = [
  'eSIM & mobile data for Korea',
  'T-money transit card (subway/bus/taxi)',
  'Tax refund (Tax Free) shopping for tourists',
  'Travel advisories & safety notices',
  'Airport transfer options (ICN/GMP)',
  'First-timer etiquette & common mistakes',
  'Crowd forecasts for popular attractions (Korea Tourism Organization live data)'
];

const PLATFORM_GUIDE = {
  threads: 'Purpose: turn a real first-timer friction point into a short reply-chain thread — the account '
    + 'posts the hook, then replies to its own post 3-4 more times so the thread reads as a running exchange '
    + '(benchmarked against real high-performing Korea-travel accounts that structure posts this way, shown '
    + 'as "1/2", "1/5" etc. in the app). '
    + 'Format: separate each of these with a blank line (this is required — the publisher splits on blank '
    + 'lines to create the reply chain, one paragraph = one post in the thread): '
    + '(1) a scroll-stopping hook (a specific number, a contrarian claim, or "the one mistake that...") '
    + '-> (2) one practical observation -> (3) a second practical observation -> (4) one caution or rule of '
    + 'thumb -> (5) a genuine question. 5 short paragraphs total, each one sentence or two at most. '
    + 'Benchmarked against real high-performing Korea-travel Threads posts: the ones that get saved/reposted '
    + 'lead with a concrete number or a specific place name (a won amount, a station/neighborhood name, a day '
    + 'count) rather than a vague qualifier ("some", "a bit", "nearby") — if the source material has a specific '
    + 'figure or place name, the hook must use it, not paraphrase it away. '
    + 'No hashtags, no markdown symbols. Each paragraph under 150 characters.',
  facebook: 'Purpose: stand completely on its own as useful native content — do not ask readers to tag, '
    + 'share, or comment as a command (Meta downranks explicit engagement-bait CTAs in 2026). '
    + 'Format: a practical promise -> 3-5 short numbered points or a short paragraph -> a one-line checklist to remember '
    + '-> end with a genuine question or a "save this" line, never a command to share/tag. '
    + '1-2 emojis max, still scannable. Never include a link in the Facebook draft.',
  instagram: 'Purpose: a visual guide people save and share. '
    + 'Format: punchy first line -> one clear tip -> save-worthy closer -> "📖 More tips on the blog — link in bio." '
    + '-> 5 relevant hashtags (e.g. #KoreaTravel #SeoulTrip).'
};

// 소수점 있는 숫자(예: "99.77%")의 마침표를 문장 구분자로 오인하면 "99. 77%"처럼
// 실제 게시글에 그대로 깨진 채 나간다(2026-08-27 발행된 혼잡도 예측 게시물에서 실제로 발생) —
// 숫자 사이의 마침표는 임시로 치환해뒀다가 분리 후 되돌린다.
const DECIMAL_PLACEHOLDER = '@@DECIMAL@@';
const splitSentences = (text) => {
  const protectedText = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_PLACEHOLDER}$2`);
  return (protectedText.match(/[^.!?]+[.!?]*/g) || [protectedText])
    .map((s) => s.trim().split(DECIMAL_PLACEHOLDER).join('.'))
    .filter(Boolean);
};

const THREADS_QUESTIONS = [
  'Anyone else run into this on their first trip?',
  'What would you add for someone landing tomorrow?',
  'Worth knowing before you land?',
  'Did this trip you up your first time too?'
];

// 'Tag someone!' / 'Share with a friend' 류의 명령형 CTA는 Meta가 2026년 기준
// engagement bait로 분류해 노출을 깎는다 — 저장/질문 등 콘텐츠 자체 가치에서
// 자연스럽게 나오는 CTA만 사용한다 (공유/태그를 직접 명령하지 않음).
const FACEBOOK_CTAS = [
  'Save this before your trip. 🇰🇷',
  'What would you add to this list?',
  'Bookmark this for arrival day. ✈️',
  'Which of these did you already know?'
];

const INSTAGRAM_CLOSERS = [
  'Save this for your Korea trip.',
  'Keep this guide handy for arrival day.',
  'Save this before you land in Korea.'
];

const INSTAGRAM_HASHTAGS = '#KoreaTravel #SeoulTrip #KoreaTips #TravelKorea #VisitSeoul';

// Threads와 같은 이유(IG도 캡션 속 외부 링크는 도달을 억제하는 경향이 있어 bio 링크로
// 유도)로, Instagram도 SNS -> 블로그 유입 순환에서 빠져 있던 CTA를 추가한다(2026-09-02
// 사용자 지적: "마지막 블로그 유입으로 가는것 까지 잘 짜여진 구조로 만들어야된다" —
// 점검해보니 Threads/Facebook은 블로그 CTA가 있었지만 Instagram만 빠져 있었음).
const INSTAGRAM_BLOG_CTA = '📖 More tips on the blog — link in bio.';

const pick = (arr, seed) => arr[seed % arr.length];

// 벤치마킹한 고성과 Threads 게시물들의 공통점: 훅 문장에 구체적 숫자나 지명이
// 있으면(예산, 요금, 역/동네 이름) "저렴한 편" 같은 모호한 표현보다 공유가 잘 됨.
// 처음 두 문장 중 숫자·₩·%·시간이 들어간 문장이 있으면 그걸 훅으로 앞세우고,
// 없으면 억지로 만들지 않고 원래 순서(sentences[0])를 그대로 씁니다.
const HAS_CONCRETE_DETAIL = /\d/;
const pickHookSentence = (sentences) => {
  const candidate = sentences.slice(0, 2).find((s) => HAS_CONCRETE_DETAIL.test(s));
  if (!candidate) return { hook: sentences[0], rest: sentences.slice(1) };
  const rest = sentences.filter((s) => s !== candidate);
  return { hook: candidate, rest };
};

/**
 * ANTHROPIC_API_KEY 없이도 같은 원본을 플랫폼 특성에 맞게 서로 다른 구조로 재가공합니다.
 * Threads: 훅 문장 -> 관찰 1~2개 -> 질문형 CTA, 각 문단을 빈 줄로 구분(최대 5조각) —
 * threads.js가 빈 줄 기준으로 잘라 훅=원 게시물, 나머지=답글 체인으로 발행한다
 * (2026-08-31 사용자 요청: 훅+답글1개였던 2단 구조를 답글 체인 최대 5조각으로 확장).
 * 문장이 부족하면 조각 수가 자연히 5개보다 적어질 뿐, 억지로 채우지 않는다.
 * Facebook: 도입 문장 + 번호 목록 + CTA (저장/공유 유도, 스캔하기 쉬운 형태)
 * seed는 같은 주제가 반복될 때 훅/CTA 문구가 겹치지 않도록 회전시키는 값입니다.
 */
const reshapeByTemplate = (rawItem, platform, seed = 0) => {
  const sentences = splitSentences(rawItem.content);

  if (platform === 'threads') {
    const { hook: pickedHook, rest } = pickHookSentence(sentences);
    const hook = pickedHook || rawItem.content;
    const question = pick(THREADS_QUESTIONS, seed);
    // 훅 다음 문장들을 순서대로 각기 다른 답글 조각으로 쓰되(최대 3개 — 훅+3+질문=5조각),
    // 문장 자체가 너무 짧아 문단이 될 만큼이 안 되면 자연스럽게 조각 수가 줄어든다.
    const observations = rest.slice(0, 3).filter(Boolean);
    const parts = [hook, ...observations, question].filter(Boolean);
    return parts.join('\n\n');
  }

  if (platform === 'facebook') {
    const intro = sentences[0] || rawItem.content;
    const points = sentences.slice(1, 4);
    const bullets = points.length
      ? points.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '';
    const cta = pick(FACEBOOK_CTAS, seed);
    return [intro, bullets, cta].filter(Boolean).join('\n\n');
  }

  if (platform === 'instagram') {
    const intro = sentences[0] || rawItem.content;
    const tip = sentences[1] || sentences[0] || rawItem.content;
    const closer = pick(INSTAGRAM_CLOSERS, seed);
    return [intro, tip, closer, INSTAGRAM_BLOG_CTA, INSTAGRAM_HASHTAGS].join('\n\n');
  }

  return rawItem.content.slice(0, 280);
};

/**
 * 수집된 원본 항목 하나를 "Land in Korea" 브랜드 톤의 플랫폼별 게시글 초안으로 큐레이션합니다.
 * 우선순위: (1) 미리 써둔 큐(prewritten_content.js — 대화형 세션에서 API 과금 없이 작성해둔 것)
 * -> (2) ANTHROPIC_API_KEY가 있으면 Claude 실시간 호출 -> (3) 규칙 기반 템플릿 재가공.
 * 매일 자동 실행되는 daily-topic.yml에는 ANTHROPIC_API_KEY를 아예 넣지 않으므로, 자동
 * 실행 중엔 (1) 아니면 (3)만 일어나고 유료 API가 호출되지 않는다(2026-08-30 사용자 요청 —
 * 자동 댓글 답장과 원문 작성이 둘 다 API를 쓰면 비용이 이중으로 나간다는 지적).
 */
const curateContent = async (rawItem, platforms = ['threads', 'facebook', 'instagram'], seed = 0) => {
  const queued = snsContentQueue.get(seed);
  if (queued && platforms.every((p) => queued[p])) {
    log.ok(`사전 작성된 콘텐츠 사용 (seed=${seed}, API 호출 없음)`);
    return queued;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    log.warn('ANTHROPIC_API_KEY가 없어 규칙 기반(템플릿) 재가공을 수행합니다.');
    const fallback = {};
    platforms.forEach((p) => { fallback[p] = reshapeByTemplate(rawItem, p, seed); });
    return fallback;
  }

  const guide = platforms.map((p) => `- ${p}: ${PLATFORM_GUIDE[p] || 'Write naturally.'}`).join('\n');
  const prompt = `You run "Land in Korea", an English-language social account helping first-time visitors and foreign residents navigate practical life in Korea. Write platform-specific post drafts based on the source material below.

[Brand topic focus — stay within these unless the source clearly fits one]
${BRAND_TOPICS.map((t) => `- ${t}`).join('\n')}

[Source material]
Source: ${rawItem.source} / @${rawItem.author}
Content: ${rawItem.content}
Link: ${rawItem.url}

[Platform guides]
${guide}

Respond ONLY with this JSON shape (no explanation, no code fences):
{${platforms.map((p) => `"${p}": "..."`).join(', ')}}`;

  try {
    const parsed = await askClaudeForJSON(prompt);
    log.ok('Claude 큐레이션 완료');
    return parsed;
  } catch (err) {
    log.err(`Claude 큐레이션 실패: ${err.message}. 템플릿 재가공으로 대체합니다.`);
    const fallback = {};
    platforms.forEach((p) => { fallback[p] = reshapeByTemplate(rawItem, p, seed); });
    return fallback;
  }
};

module.exports = { curateContent, reshapeByTemplate };
