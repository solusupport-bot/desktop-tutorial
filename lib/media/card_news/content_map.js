const log = require('../../logger');
const {
  splitSentences,
  pickHookSentence,
  pick,
  PROMISE_OPENERS,
  INSTAGRAM_CLOSERS,
  INSTAGRAM_BLOG_CTA
} = require('../../curation/curate');
const { fetchTopicImages } = require('../../ingestion/pexels_image');

// lib/curation/curate.js의 reshapeByTemplate과 같은 원칙: 새 사실을 지어내지 않고,
// lib/ingestion/korea_travel.js의 실제 문장을 그대로 재배치한다. "제목"만 필요한
// 자리(팁/주의사항 슬라이드)에는 사실 주장이 아닌 일반적인 연결 문구 뱅크를 쓴다 —
// PROMISE_OPENERS/FACEBOOK_CTAS와 같은 성격(특정 사실을 담지 않으므로 틀릴 수 없음).
const TIP_TITLES = [
  'Good to know before you go',
  'One thing locals do differently',
  'Worth knowing ahead of time',
  'The detail most guides skip',
  'A small thing that matters',
  'What actually happens on the ground'
];

const CAUTION_TITLES = [
  'Before you buy',
  'One thing to watch for',
  'Easy to miss',
  'Where first-timers slip up',
  'Common mix-up',
  'Check this first'
];

// korea_travel.js의 content는 주제당 여러 "각도" 문자열의 배열이다(단일 캡션을 만들
// 때는 호출부가 seed로 각도 하나만 골라 쓰지만, 카드뉴스는 슬롯이 5개나 되어 한
// 각도만으로는 문장이 모자라기 쉽다) — 있는 각도를 전부 합쳐서 문장 풀을 만든다.
const flattenSentences = (content) => {
  const angles = Array.isArray(content) ? content : [content];
  return angles.flatMap((angle) => splitSentences(angle));
};

// 문장 수가 슬롯 수(5개: context/tip1/tip2/tip3/caution)보다 적은 짧은 주제도 있다 —
// 지어내는 대신 있는 문장을 순환 재사용한다(렌더러는 슬롯이 비어 있으면 아예 실패한다).
const pickAt = (sentences, index) => sentences[index % sentences.length];

/**
 * korea_travel.js 형태의 주제 항목(source, content, placeKeyword 등)을 받아
 * lib/media/card_news의 9슬라이드 콘텐츠 계약(topicLabel/hook/coverImage/.../closing)으로
 * 변환한다.
 *
 * images를 직접 넘기면(테스트/자리표시자용) Pexels 조회를 건너뛴다. 넘기지 않으면
 * PEXELS_API_KEY로 한국 확인 이미지 최대 3장을 조회하고, 하나도 못 구하면 에러를
 * 던진다(카드뉴스는 사진이 필수라 이미지 없이 진행할 수 없다 — 다른 플랫폼처럼
 * "텍스트만 발행"으로 조용히 넘어가지 않는다).
 */
const buildCardNewsContent = async (topicItem, { seed = 0, images: providedImages } = {}) => {
  const sentences = flattenSentences(topicItem.content);
  if (sentences.length === 0) {
    throw new Error(`"${topicItem.source}"에 문장으로 쪼갤 콘텐츠가 없습니다.`);
  }

  const { hook: revealSentence, rest } = pickHookSentence(sentences);
  const remaining = rest.length > 0 ? rest : sentences;
  if (remaining.length < 5) {
    log.warn(`"${topicItem.source}" 실제 문장이 ${remaining.length}개뿐이라 카드뉴스 5슬롯 일부에서 문장이 겹칩니다(지어내지 않고 재사용).`);
  }

  let images = providedImages;
  if (!images) {
    images = await fetchTopicImages(topicItem.source, [], seed, 3);
    if (images.length === 0) {
      throw new Error(`"${topicItem.source}" 이미지를 확보하지 못했습니다(PEXELS_API_KEY 없음 또는 검색 실패) — 카드뉴스는 사진이 필수라 진행할 수 없습니다.`);
    }
    if (images.length < 3) {
      log.warn(`"${topicItem.source}" 한국 확인 이미지가 ${images.length}장뿐이라 일부 슬라이드에서 이미지가 겹칩니다.`);
    }
  }
  const coverImage = images[0];
  const photo1Image = images[1] || images[0];
  const photo2Image = images[2] || images[images.length - 1];

  const caption = topicItem.placeKeyword ? `${topicItem.source} (${topicItem.placeKeyword})` : topicItem.source;

  return {
    topicLabel: topicItem.source.toUpperCase(),
    hook: `${pick(PROMISE_OPENERS, seed)}\n${revealSentence}`,
    coverImage,
    context: pickAt(remaining, 0),
    tip1: { title: pick(TIP_TITLES, seed), body: pickAt(remaining, 1) },
    photo1: { image: photo1Image, caption },
    tip2: { title: pick(TIP_TITLES, seed + 1), body: pickAt(remaining, 2) },
    tip3: { title: pick(TIP_TITLES, seed + 2), body: pickAt(remaining, 3) },
    photo2: { image: photo2Image, caption },
    caution: { title: pick(CAUTION_TITLES, seed), body: pickAt(remaining, 4) },
    closing: { headline: pick(INSTAGRAM_CLOSERS, seed), body: INSTAGRAM_BLOG_CTA }
  };
};

module.exports = { buildCardNewsContent };
