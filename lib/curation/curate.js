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

// 2026-09 리서치 근거(Threads/Reels 바이럴 요인 웹 조사): 도달을 가장 잘 견인하는 훅은
// "약속 제시 -> 반전/구체적 사실" 2박자 구조다 — 첫 비트가 궁금증만 만들고(구체적 정보를
// 아직 주지 않음), 두 번째 비트에서 숫자/지명 등 구체적 사실로 반전을 준다. 기존엔 구체적
// 훅 문장으로 바로 시작했는데, 그 앞에 궁금증 유발 문장을 한 단계 추가한다.
const PLATFORM_GUIDE = {
  threads: 'Purpose: turn a real first-timer friction point into a short reply-chain thread — the account '
    + 'posts the hook, then replies to its own post 3-4 more times so the thread reads as a running exchange '
    + '(benchmarked against real high-performing Korea-travel accounts that structure posts this way, shown '
    + 'as "1/2", "1/5" etc. in the app). '
    + 'Format: separate each of these with a blank line (this is required — the publisher splits on blank '
    + 'lines to create the reply chain, one paragraph = one post in the thread): '
    + '(1) a curiosity-gap promise with NO specifics yet (e.g. "Most tourists get this wrong in their first '
    + 'hour" / "This mistake costs people real money") -> (2) the reveal: a scroll-stopping fact with a '
    + 'specific number, won amount, or place name -> (3) one practical observation -> (4) one caution or rule '
    + 'of thumb -> (5) a genuine question. 5 short paragraphs total, each one sentence or two at most. '
    + 'Benchmarked against real high-performing Korea-travel Threads posts: the reveal beat must lead with a '
    + 'concrete number or a specific place name (a won amount, a station/neighborhood name, a day count) '
    + 'rather than a vague qualifier ("some", "a bit", "nearby") — if the source material has a specific '
    + 'figure or place name, use it there, not paraphrase it away. '
    + 'No hashtags, no markdown symbols. Each paragraph under 150 characters.',
  facebook: 'Purpose: stand completely on its own as useful native content — do not ask readers to tag, '
    + 'share, or comment as a command (Meta downranks explicit engagement-bait CTAs in 2026). '
    + 'Format: a curiosity-gap promise, immediately followed by the concrete reveal in the same opening line '
    + '-> 3-5 short numbered points or a short paragraph -> a one-line checklist to remember '
    + '-> end with a genuine question or a "save this" line, never a command to share/tag. '
    + '1-2 emojis max, still scannable. Never include a link in the Facebook draft.',
  instagram: 'Purpose: a visual guide people save and share. First line must work as a video hook read in the '
    + 'first 1-2 seconds. '
    + 'Format: a curiosity-gap promise with no specifics (the hook) -> the concrete reveal/tip -> save-worthy '
    + 'closer -> "📖 More tips on the blog — link in bio." -> 5 relevant hashtags (e.g. #KoreaTravel #SeoulTrip).',
  bluesky: 'Purpose: same reply-chain structure as threads, but for an audience that skews toward people who '
    + 'left other platforms and dislike marketing voice — be plain and specific, never breathless. '
    + 'Format: separate each with a blank line (the publisher splits on blank lines to build the reply '
    + 'chain): (1) a curiosity-gap promise -> (2) the reveal with a specific number, won amount, or place '
    + 'name -> (3) one practical observation -> (4) one caution -> (5) a genuine question. '
    + 'HARD LIMIT: each paragraph must be under 280 characters — Bluesky caps a post at 300 graphemes and '
    + 'anything longer gets split again or truncated. 1-2 hashtags maximum, placed inline where they read '
    + 'naturally. Do not add a link — the publisher appends the blog URL itself.',
  mastodon: 'Purpose: same reply-chain structure as threads, for a fediverse audience that rewards genuinely '
    + 'useful posts and is hostile to engagement-bait and ad voice. Write like a knowledgeable person sharing '
    + 'something, not like a brand. '
    + 'Format: separate each with a blank line (the publisher splits on blank lines to build the reply '
    + 'chain): (1) a curiosity-gap promise -> (2) the reveal with a specific number or place name -> '
    + '(3) one practical observation -> (4) one caution -> (5) a genuine question. '
    + 'Keep each paragraph under 450 characters. 2-3 hashtags maximum — on Mastodon hashtag timelines '
    + 'federate across instances and are a real discovery path, so choose specific ones (#KoreaTravel, '
    + '#Seoul) over generic ones. Do not add a link — the publisher appends the blog URL.',
  tumblr: 'Purpose: a single self-contained post (no reply chain, length is not a constraint) for an '
    + 'audience that favors genuinely useful, specific writing over marketing voice and reblogs posts that '
    + 'feel worth saving. '
    + 'Format: a curiosity-gap opening line that states the concrete reveal in the same sentence (do not '
    + 'split hook and reveal across paragraphs like Threads does) -> 2-3 short numbered points with real '
    + 'specifics (a won amount, a place name, a time) -> a one-line closer. '
    + 'Do not include hashtags in the body — Tumblr discovery runs on the tags field the publisher attaches '
    + 'separately, not on inline "#word" text. Do not add a link — the publisher appends the blog URL.'
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
  'Anyone else lose money on this mistake?',
  'What would you add for someone landing tomorrow?',
  'Worth knowing before you land? Reply with what surprised you.',
  'Did this trip you up your first time too? Drop a comment.',
  'How much did this actually cost you on your trip?',
  'Tag someone who needs to see this before booking.'
];

// 'Tag someone!' / 'Share with a friend' 류의 명령형 CTA는 Meta가 2026년 기준
// engagement bait로 분류해 노출을 깎는다 — 저장/질문 등 콘텐츠 자체 가치에서
// 자연스럽게 나오는 CTA만 사용한다 (공유/태그를 직접 명령하지 않음).
const FACEBOOK_CTAS = [
  'Save this before your trip — you\'ll need it. 🇰🇷',
  'Which mistake have you made? Comment below.',
  'Bookmark this for arrival day — seriously. ✈️',
  'How much did this cost you? Share your story.',
  'Done any of these? Which surprised you most?',
  'Save if you\'re going to Korea anytime soon.'
];

const INSTAGRAM_CLOSERS = [
  'Save this — you\'ll regret it if you don\'t.',
  'Comment: which one surprised you the most?',
  'Screenshot this before you land in Korea.',
  'Done any of these? Comment your story below.',
  'Save this guide — trust me on this one.',
  'Which one did you NOT know? Drop a 🇰🇷'
];

const INSTAGRAM_HASHTAGS = '#KoreaTravel #SeoulTrip #KoreaTips #TravelKorea #VisitSeoul';

// "약속 -> 반전" 2단 훅의 첫 비트: 구체적 정보 없이 궁금증만 유발한다(2026-09 리서치 —
// Reels 바이럴 사례는 첫 1~2초에 약속을 던지고 다음 비트에서 구체적 사실로 반전을
// 준다). reshapeByTemplate에서 이 다음에 기존 구체적 hook/tip 문장을 반전으로 붙인다.
const PROMISE_OPENERS = [
  'Most tourists get this wrong in their first hour.',
  'This mistake costs people real money — and they don\'t find out until it\'s too late.',
  'Everyone assumes this works the same as back home. It doesn\'t.',
  'There\'s one detail that trips up almost every first-timer.',
  'Nobody tells you this before you land.',
  'This looks simple until it actually happens to you.'
];

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
    const promise = pick(PROMISE_OPENERS, seed);
    const question = pick(THREADS_QUESTIONS, seed);
    // 약속(궁금증 유발) -> 반전(구체적 훅) -> 관찰 최대 2개 -> 질문 = 최대 5조각
    // (MAX_THREAD_PARTS=5 유지). 문장이 부족하면 자연스럽게 조각 수가 줄어든다.
    const observations = rest.slice(0, 2).filter(Boolean);
    const parts = [promise, hook, ...observations, question].filter(Boolean);
    return parts.join('\n\n');
  }

  if (platform === 'facebook') {
    const promise = pick(PROMISE_OPENERS, seed);
    const intro = sentences[0] || rawItem.content;
    const points = sentences.slice(1, 4);
    const bullets = points.length
      ? points.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '';
    const cta = pick(FACEBOOK_CTAS, seed);
    return [`${promise} ${intro}`, bullets, cta].filter(Boolean).join('\n\n');
  }

  if (platform === 'instagram') {
    const promise = pick(PROMISE_OPENERS, seed);
    const tip = sentences[1] || sentences[0] || rawItem.content;
    const closer = pick(INSTAGRAM_CLOSERS, seed);
    return [promise, tip, closer, INSTAGRAM_BLOG_CTA, INSTAGRAM_HASHTAGS].join('\n\n');
  }

  if (platform === 'bluesky' || platform === 'mastodon') {
    // 둘 다 답글 체인 구조라 threads와 같은 조각 구성을 쓴다. 다만 threads는 본문에
    // URL을 넣으면 도달이 억제돼서 "링크는 bio에"로 우회하는데, 이 둘은 링크 페널티가
    // 없어 발행 단계(daily-auto-post.js)에서 글 주소를 본문에 직접 붙인다 — 그래서
    // 여기서는 CTA 문구를 넣지 않고 조각만 만든다.
    const { hook: pickedHook, rest } = pickHookSentence(sentences);
    const hook = pickedHook || rawItem.content;
    const promise = pick(PROMISE_OPENERS, seed);
    const observations = rest.slice(0, 2).filter(Boolean);
    const question = pick(THREADS_QUESTIONS, seed);
    return [promise, hook, ...observations, question].filter(Boolean).join('\n\n');
  }

  if (platform === 'tumblr') {
    // Tumblr는 답글 체인이 없는 단일 게시물이라 pinterest/facebook과 같은 번호
    // 매긴 tip 구조를 재사용한다 — 발견 경로가 본문 해시태그가 아니라 게시물의
    // tags 필드(tumblr.js가 별도로 붙인다)라, 본문에 해시태그를 넣지 않는다.
    const intro = sentences[0] || rawItem.content;
    const points = sentences.slice(1, 4);
    const bullets = points.length
      ? points.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '';
    return [intro, bullets].filter(Boolean).join('\n\n');
  }

  if (platform === 'pinterest') {
    // Pinterest는 검색엔진에 가깝다 — 캡션 형식보다 키워드 밀도가 중요하므로
    // facebook과 같은 번호 매긴 구체적 tip 구조를 그대로 재사용한다.
    const intro = sentences[0] || rawItem.content;
    const points = sentences.slice(1, 4);
    const bullets = points.length
      ? points.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '';
    return [intro, bullets].filter(Boolean).join('\n\n');
  }

  return rawItem.content.slice(0, 280);
};

// 2026-09-02 발견한 문제: data/sns_content_queue.json에 seed 37~126까지 이미 캐시돼
// 있어서(현재 진행 seed는 49대) curateContent가 캐시를 무조건 우선하는 한, 하루 3개
// 기준 약 26일간 아래 새 훅 구조가 실제로는 전혀 안 쓰일 뻔했다. 캐시를 지우는 대신,
// 캐시된(사람이 직접 쓴, 품질 좋은) 본문은 그대로 살리고 그 앞에 약속형 훅만 얹는다 —
// reshapeByTemplate과 동일한 "약속(궁금증) -> 반전(캐시된 구체적 본문)" 구조가 되도록.
const applyPromiseHook = (platform, text, seed) => {
  const promise = pick(PROMISE_OPENERS, seed);
  if (platform === 'facebook') {
    const [firstLine, ...rest] = text.split('\n\n');
    return [`${promise} ${firstLine}`, ...rest].join('\n\n');
  }
  // threads/instagram: 새 문단으로 앞에 붙인다. threads는 splitIntoThreadParts가
  // 문단 5개를 넘으면 마지막 조각에 나머지를 합치므로 답글 체인이 깨지지 않는다.
  const hooked = `${promise}\n\n${text}`;
  // 2026-09-04 실측 버그: 캐시된(미리 써둔) Instagram 캡션 90개 전부에 블로그 CTA가
  // 없었다 — reshapeByTemplate 경로에만 INSTAGRAM_BLOG_CTA를 붙이고 있어서, 캐시를
  // 우선하는 자동 실행(daily-topic.yml)에서는 약 30일치 게시물이 블로그로 가는 길
  // 없이 해시태그로 끝나 있었다. 여기서도 동일하게 보장한다(해시태그 줄 바로 앞에
  // 넣어야 CTA가 해시태그 더미에 묻히지 않는다).
  if (platform !== 'instagram' || /link in bio|landinkorea/i.test(hooked)) return hooked;
  const paragraphs = hooked.split('\n\n');
  const hashtagIndex = paragraphs.findIndex((p) => p.trim().startsWith('#'));
  if (hashtagIndex === -1) return `${hooked}\n\n${INSTAGRAM_BLOG_CTA}`;
  paragraphs.splice(hashtagIndex, 0, INSTAGRAM_BLOG_CTA);
  return paragraphs.join('\n\n');
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
  // 2026-09-04: reddit(먼저 추가) 이후 pinterest까지 추가하면서 캐시 체크가 "모든
  // 플랫폼이 캐시에 있어야" 조건이라, 캐시에 없는 새 플랫폼 하나 때문에 기존
  // threads/facebook/instagram 90개 캐시 전체가 무효화되고 매번 템플릿으로 대체될
  // 뻔했다(실제로 reddit 추가 커밋에서 이미 발생 중이었고, pinterest 테스트 중에야
  // 발견함). sns_content_queue.json에 원본이 없는 플랫폼(reddit, pinterest)은 캐시
  // 필수 목록에서 빼고, facebook 캡션(번호 매긴 구체적 tip 목록)을 재활용한다.
  // 2026-09-05: bluesky/mastodon을 추가하면서 같은 함정을 또 밟을 뻔했다 — 캐시에 없는
  // 플랫폼을 여기 등록하지 않으면 기존 캐시 전체가 무효화된다. 다만 재활용 원본은
  // reddit/pinterest(facebook의 번호 매긴 tip 목록)와 다르다: bluesky/mastodon은 둘 다
  // 답글 체인 구조라 threads 캡션(빈 줄로 구분된 5문단)이 그대로 맞는다.
  // tumblr는 threads/bluesky/mastodon과 달리 답글 체인이 없는 단일 게시물이라
  // facebook의 "구체적 tip 번호 목록" 구조(문단이 이미 하나로 뭉쳐 있음)가 더
  // 잘 맞는다 — threads 원문을 쓰면 문단이 쪼개진 채로 한 게시물에 다 들어가
  // 버려 어색하다.
  const UNCACHED_PLATFORMS = ['reddit', 'pinterest', 'bluesky', 'mastodon', 'tumblr'];
  const CHAIN_PLATFORMS = ['bluesky', 'mastodon'];
  const cacheRequiredPlatforms = platforms.filter((p) => !UNCACHED_PLATFORMS.includes(p));
  if (queued && cacheRequiredPlatforms.every((p) => queued[p])) {
    log.ok(`사전 작성된 콘텐츠 사용, 약속형 훅 적용 (seed=${seed}, API 호출 없음)`);
    const hooked = {};
    platforms.forEach((p) => {
      if (CHAIN_PLATFORMS.includes(p)) {
        // threads 캡션을 그대로 쓰되 약속형 훅도 같이 적용한다 — 훅이 별도 문단으로
        // 앞에 붙으면서 "훅 -> 본문"의 2조각 답글 체인이 만들어진다. 그냥 재활용만
        // 하면 캐시된 threads 원문이 한 문단짜리라 조각이 안 나뉘고 단발 게시물이 된다.
        hooked[p] = queued.threads
          ? applyPromiseHook(p, queued.threads, seed)
          : (queued.facebook || rawItem.content);
      } else if (UNCACHED_PLATFORMS.includes(p)) {
        hooked[p] = queued.facebook || queued.threads || rawItem.content;
      } else {
        hooked[p] = applyPromiseHook(p, queued[p], seed);
      }
    });
    return hooked;
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
