const axios = require('axios');
const { askAIForJSON, askCloudflareForJSON } = require('../ai/llm');
const log = require('../logger');

// 2026-11-17: Groq 무료 등급 Developer 업그레이드가 Groq 쪽 "수요 폭증"으로 막혀 있어
// (결제수단 등록 자체 불가, console.groq.com 메시지) 번역이 하루 중 자주 영어만으로
// 떨어진다. media_guard.js의 비전 검증과 같은 방식으로 이미 연결된 Cloudflare Workers AI
// (완전히 별개의 하루 10,000 Neurons 무료 쿼터)를 1순위로 쓰고, 실패하거나 키가 없으면
// Groq로 폴백한다. askCloudflareForJSON은 lib/ai/llm.js의 공용 헬퍼를 그대로 쓴다
// (2026-11-18: askAIForJSON 자체도 내부적으로 같은 Cloudflare 폴백을 쓰게 됐다 — 중복
// 구현 대신 한 곳에서만 관리한다).

// 2026-11-17 실측: Groq(하루 20만 토큰)와 Cloudflare(하루 1만 Neurons) 둘 다 캡션
// 생성·품질게이트 재시도·사진 비전검증(media_guard.js)과 같은 계정 쿼터를 나눠 쓰다
// 보니, 번역 차례가 올 때쯤엔 둘 다 거의 소진돼 있어 대부분 영어만 발행되고 있었다
// (해당 날짜 큐 중 번역이 실제로 붙은 글은 소수). 그 쿼터와 전혀 안 겹치는, 키가
// 필요 없는 MyMemory 번역 API를 마지막 폴백으로 추가한다 — LLM보다 품질은 떨어지지만
// "영어만 발행"보다는 낫다.
const MYMEMORY_LANG = { ja: 'ja', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' };
// 2026-11-18 실측 버그: MyMemory 익명 요청은 500바이트에서 잘리는데, 넘치는 부분을
// 그냥 잘라 "..."를 붙였더니 문장 중간에서 끊긴 번역(마지막 문장이 통째로 사라짐)이
// 그대로 발행 대기열에 들어갔다(Threads 3건 실측 — 번역이 전부 "...这次旅行是否让您……"
// 처럼 뭉개진 채 끝남). 잘린 번역은 "영어만 발행"보다 못하므로, 길이를 넘으면 아예
// 그 언어를 건너뛴다(null) — 나머지 언어나 영어는 그대로 쓸 수 있게.
const MYMEMORY_MAX_CHARS = 450;

const translateOneWithMyMemory = async (text, targetLang) => {
  if (text.length > MYMEMORY_MAX_CHARS) return null;
  const res = await axios.get('https://api.mymemory.translated.net/get', {
    params: { q: text, langpair: `en|${targetLang}` },
    timeout: 15000
  });
  const translated = res.data?.responseData?.translatedText;
  if (!translated || /MYMEMORY WARNING/i.test(translated)) return null;
  return translated;
};

const translateViaMyMemory = async (platforms, sourceForTranslation) => {
  const result = {};
  for (const p of platforms) {
    const entry = {};
    for (const [code, mmCode] of Object.entries(MYMEMORY_LANG)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        entry[code] = await translateOneWithMyMemory(sourceForTranslation[p], mmCode);
      } catch (err) {
        log.warn(`MyMemory 번역 실패(${p}/${code}): ${err.message}`);
      }
    }
    if (Object.values(entry).some(Boolean)) result[p] = entry;
  }
  return Object.keys(result).length ? result : null;
};

// 2026-11-16 사용자 결정: SNS 게시물은 전부 영어 + 일본어 + 중국어 간체 + 중국어 번체
// 4개 언어로 발행한다("할당량 그대로" — 플랫폼별 하루 발행 개수는 그대로 두고, 한
// 게시물 안에 언어를 이어붙인다). 번체(홍콩/대만)와 간체(본토)는 글자 자체가 달라
// 하나로 퉁칠 수 없다(홍콩어라는 별도 표준 언어는 없음 — 문어는 번체를 씀).
const LANGUAGES = [
  { code: 'ja', flag: '🇯🇵' },
  { code: 'zh-Hans', flag: '🇨🇳' },
  { code: 'zh-Hant', flag: '🇹🇼' }
];

// threads/bluesky/mastodon은 빈 줄 기준으로 답글 체인을 만든다 — 언어마다 원문과
// 같은 문단 수를 통째로 붙이면 체인이 과도하게 길어지고 글자수 제한(블루스카이
// 300자 등)에 걸려 잘린다. 번역은 언어당 짧은 문장 하나로 압축해 답글 체인에
// 한 조각씩만 더한다(threads.js/bluesky.js/mastodon.js의 MAX_THREAD_PARTS를 언어
// 3개만큼 늘려뒀다).
const CHAIN_PLATFORMS = ['threads', 'bluesky', 'mastodon'];
const condense = (text) => (text || '').split(/\n\n+/).map((p) => p.trim()).filter(Boolean).join(' ');

// 각 발행기의 기존(번역 추가 전) 답글 체인 한도. 번역 문단을 그냥 이어붙이고 발행기의
// 새 한도(기존 + 3)에 맡기면, 영어 쪽 문단 수가 원래 한도보다 적을 때만 안전하고,
// 그 이상이면 발행기가 번역 문단까지 한데 뭉쳐버린다("문단 수가 새 한도보다 많을 때만
// 합친다"는 각 발행기의 capParts 규칙 때문). 그래서 번역을 붙이기 전에 영어 쪽을 여기서
// 미리 기존 한도만큼 압축해 둔다 — 그래야 항상 "영어(기존 한도 이하) + 번역 3조각"이
// 발행기의 새 한도(기존 + 3) 안에 딱 들어가 번역 조각이 섞여 잘리지 않는다.
const ORIGINAL_CHAIN_CAPS = { threads: 3, bluesky: 5, mastodon: 5 };
const compressToCap = (text, maxParts) => {
  const parts = (text || '').split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= maxParts) return text;
  if (maxParts <= 1) return parts.join(' ');
  const head = parts.slice(0, maxParts - 1);
  const tail = parts.slice(maxParts - 1).join(' ');
  return [...head, tail].join('\n\n');
};

/**
 * 영어로 완성되고 품질 게이트를 통과한 플랫폼별 본문(byPlatform)에 일본어/중국어
 * 간체/중국어 번체 번역을 덧붙입니다. Cloudflare -> Groq -> MyMemory 순으로 시도하고,
 * 키가 전혀 없거나 셋 다 실패하면 영어만 있는 원본을 그대로 돌려줍니다(발행 자체를
 * 막지 않음).
 */
const addMultilingual = async (byPlatform) => {
  const platforms = Object.keys(byPlatform || {});
  if (!platforms.length) return byPlatform;

  const hasCloudflare = process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!hasCloudflare && !process.env.GROQ_API_KEY) {
    log.warn('CLOUDFLARE_API_TOKEN/GROQ_API_KEY가 없어 다국어 번역을 건너뜁니다(영어만 발행).');
    return byPlatform;
  }

  const sourceForTranslation = {};
  platforms.forEach((p) => {
    sourceForTranslation[p] = CHAIN_PLATFORMS.includes(p) ? condense(byPlatform[p]) : byPlatform[p];
  });

  const prompt = `Translate each of these social media post drafts into Japanese, Simplified Chinese, and Traditional Chinese.
Rules:
- Keep hashtags, emoji, URLs, and the brand name "Land in Korea" unchanged.
- Keep won amounts (₩...) unchanged, only translate the surrounding words.
- Read naturally in the target language — not a literal word-for-word translation.
- Do not add any fact, CTA, or hashtag that is not already in the source.
- For ${CHAIN_PLATFORMS.join('/')}, respond with ONE short plain sentence per language (under 100 characters), carrying only the single most useful fact — these feed a reply-chain post with a tight character limit, not the full draft.
- For every other platform, translate the full draft as one block, keeping it roughly as long as the source.

[Source drafts]
${platforms.map((p) => `${p}: ${sourceForTranslation[p]}`).join('\n\n')}

Respond ONLY with this JSON shape (no explanation, no code fences):
{${platforms.map((p) => `"${p}": {"ja": "...", "zh-Hans": "...", "zh-Hant": "..."}`).join(', ')}}`;

  let translations;
  try {
    translations = await askCloudflareForJSON(prompt);
  } catch (err) {
    log.warn(`Cloudflare 번역 실패, Groq로 폴백: ${err.message}`);
  }
  if (!translations) {
    try {
      translations = await askAIForJSON(prompt);
    } catch (err) {
      log.warn(`Groq 번역도 실패, MyMemory로 폴백: ${err.message}`);
    }
  }
  if (!translations) {
    try {
      translations = await translateViaMyMemory(platforms, sourceForTranslation);
    } catch (err) {
      log.err(`MyMemory 번역까지 실패: ${err.message}. 영어만 발행합니다.`);
      return byPlatform;
    }
  }
  if (!translations) return byPlatform;

  const result = {};
  platforms.forEach((p) => {
    const english = ORIGINAL_CHAIN_CAPS[p] ? compressToCap(byPlatform[p], ORIGINAL_CHAIN_CAPS[p]) : byPlatform[p];
    const t = translations[p];
    if (!t) { result[p] = english; return; }
    const blocks = LANGUAGES.map(({ code, flag }) => (t[code] ? `${flag} ${t[code]}` : null)).filter(Boolean);
    result[p] = blocks.length ? [english, ...blocks].join('\n\n') : english;
  });
  return result;
};

module.exports = {
  addMultilingual, condense, compressToCap, LANGUAGES, CHAIN_PLATFORMS,
  MYMEMORY_MAX_CHARS, translateOneWithMyMemory
};
