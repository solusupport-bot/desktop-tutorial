// 2026-10-08: generate-topics.js의 기존 중복 검사는 정규화한 문자열이 "완전히
// 같을 때"만 걸러냈다 — 그런데 실제로 새어 들어온 중복은 "DMZ and JSA tours" vs
// "DMZ/JSA tours"처럼 문구만 줄이거나 바꾼 근접 중복이었다(사용자 실측 지적,
// topic_bank.json에 5쌍이 있었고 그중 4개는 이미 블로그에 중복 발행까지 됨).
// 토큰 집합의 Jaccard 유사도로 "거의 같은 주제"를 잡아낸다.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'vs', 'for', 'to', 'in', 'of', 'with',
  'your', 'you', 'how', 'what', 'when', 'where', 'why', 'is', 'are',
  'on', 'at', 'from', 'by', 'it', 'its', "it's", 'that', 'this'
]);

const tokenize = (topic) => new Set(
  topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
);

const jaccard = (setA, setB) => {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return { score: intersection / union, intersection };
};

// 임계값은 topic_bank.json에 실제로 있었던 5개 중복 쌍 중 가장 낮은 값(0.43,
// "First-timer etiquette & common mistakes" vs "First-timer mistakes part 2")
// 보다 낮게, 그러나 서로 다른 진짜 주제(예: "Domestic flights vs. KTX..." vs
// "KTX vs. SRT vs. intercity bus...", 실측 0.36)는 안 걸리게 잡은 값이다.
// 최소 공유 토큰 수도 같이 요구해 짧은 주제명끼리 우연히 겹치는 것을 막는다.
const SIMILARITY_THRESHOLD = 0.4;
const MIN_SHARED_TOKENS = 3;

/** 두 주제명이 "사실상 같은 주제"인지 판단합니다. */
const isNearDuplicateTopic = (topicA, topicB) => {
  const { score, intersection } = jaccard(tokenize(topicA), tokenize(topicB));
  return score >= SIMILARITY_THRESHOLD && intersection >= MIN_SHARED_TOKENS;
};

/** candidate가 existingTopics 중 하나와 근접 중복이면 그 주제명을, 아니면 null을 반환합니다. */
const findNearDuplicate = (candidate, existingTopics) => {
  for (const existing of existingTopics) {
    if (existing !== candidate && isNearDuplicateTopic(candidate, existing)) return existing;
  }
  return null;
};

module.exports = { isNearDuplicateTopic, findNearDuplicate, tokenize, jaccard, SIMILARITY_THRESHOLD, MIN_SHARED_TOKENS };
