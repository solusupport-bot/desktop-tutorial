// 발행 직전 하드 게이트 — land-in-korea-blog/docs/SEO_ADSENSE_CHECKLIST.md 기준을 코드로 강제한다.
// 2026-09-23: API 크레딧 소진으로 Claude 생성이 실패하자 템플릿 폴백이 260~290단어짜리 글을
// 5일 연속 "성공"으로 발행했다. 사람이 매번 보는 검수는 결국 빠지므로, 기준 미달이면 아예 푸시를 막는다.
const crypto = require('crypto');

const MIN_WORDS = 800;
const REQUIRED_REVIEWS = 2;
// 2026-09-24 사용자 결정(B안): Groq 무료 검수자(ai_review.js)는 맞는 사실을 틀렸다고 판정하는 일이 잦아
// (도봉산역 1·7호선, 다이소 5,000원 상한 등) 둘 중 하나만 통과해도 발행한다.
const GROQ_REVIEWERS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];

const countWords = (text) => (text.match(/\S+/g) || []).length;

const checkPostQuality = (post) => {
  const problems = [];
  const title = post.title || '';
  const description = post.description || '';
  const body = post.body || '';
  const faq = Array.isArray(post.faq) ? post.faq : [];
  const words = countWords(body) + faq.reduce((n, f) => n + countWords(`${f.question} ${f.answer}`), 0);

  if (words < MIN_WORDS) problems.push(`단어 수 ${words} < ${MIN_WORDS}`);
  if (title.length < 50 || title.length > 60) problems.push(`제목 길이 ${title.length}자 (50~60자)`);
  if (/What First-Timers Actually Need to Know/i.test(title)) problems.push('템플릿 제목 꼬리말 사용');
  if (description.length < 120 || description.length > 160) problems.push(`설명 길이 ${description.length}자 (120~160자)`);
  if ((body.match(/^## /gm) || []).length < 3) problems.push('## 소제목 3개 미만');
  if (/^# /m.test(body)) problems.push('본문에 # H1 사용');
  if (faq.length !== 3) problems.push(`FAQ ${faq.length}개 (3개 필요)`);
  return problems;
};

// 검수는 글 "내용"에 묶는다 — 검수 뒤 한 글자라도 고치면 해시가 달라져 검수가 무효가 된다.
const contentHash = (post) => crypto.createHash('sha256')
  .update(JSON.stringify([post.title, post.description, post.body, post.faq]))
  .digest('hex');

// 2026-09-23 사용자 지시: 발행 전 독립 검수 2회. 서로 다른 검수자 2명이 현재 내용 그대로를
// 통과시켜야 한다(같은 검수자 두 번, 수정 전 내용에 대한 검수는 인정 안 함).
const checkReviews = (post) => {
  const hash = contentHash(post);
  const passed = (Array.isArray(post.reviews) ? post.reviews : [])
    .filter((r) => r && r.pass === true && r.hash === hash && r.reviewer);
  const reviewers = new Set(passed.map((r) => r.reviewer));
  const groqPassed = GROQ_REVIEWERS.some((r) => reviewers.has(r));
  return reviewers.size >= REQUIRED_REVIEWS || groqPassed ? [] : [`현재 내용에 대한 독립 검수 ${reviewers.size}/${REQUIRED_REVIEWS}회`];
};

const checkPublishable = (post) => [...checkPostQuality(post), ...checkReviews(post)];

module.exports = { checkPostQuality, checkReviews, checkPublishable, contentHash, MIN_WORDS, REQUIRED_REVIEWS, GROQ_REVIEWERS };
