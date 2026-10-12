// 독립 검증자 — 사전 작성 글(Claude Code 세션 작성)을 제작사가 다른 두 모델이 발행 전 심사한다
// (2026-09-23 사용자 지시, 2026-09-24 크레딧 소진으로 Groq 무료 등급으로 이전).
// 규칙 게이트(blog_quality.js)가 못 잡는 것: 근거 없는 사실, 기존 글과의 중복, 뻔한 AI 채움 문장.
// 결과는 글의 reviews[]에 내용 해시와 함께 남고, blog_quality.js checkReviews가 2명 통과를 요구한다.
const { contentHash, GROQ_REVIEWERS } = require('./blog_quality');

// 검수자별 max_tokens — qwen 무료 등급은 분당 출력 1,000토큰이 상한, gpt-oss는 추론 토큰까지 포함해야 JSON이 끝까지 나온다.
const MAX_TOKENS = { 'qwen/qwen3.8-27b': 800, 'openai/gpt-oss-120b': 3000 };
const REVIEWERS = GROQ_REVIEWERS;

// 호출·파싱 실패는 throw — 판정이 아니므로 기록하지 않고 다음 실행에서 다시 검수한다.
const reviewPost = async (post, model, { facts = [], existingPosts = [] } = {}) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY 없음');

  const prompt = `You are a strict pre-publication reviewer for "Land in Korea", an English blog for foreigners visiting or living in Korea. The site is applying for Google AdSense, so thin, duplicated, or inaccurate content is a hard fail.

Review the post below and FAIL it if ANY of these is true:
1. It states a specific fact (price, rule, law, schedule, name, number) that is wrong or that you believe is likely wrong for Korea as of 2026. ${facts.length ? 'Verified source facts are provided; claims beyond them are allowed only if they are well-established and accurate.' : ''}
2. It substantially duplicates an existing post on the site (same subject and same angle), listed below.
3. It is generic filler: vague advice with no Korea-specific substance, repeated sentences, templated phrasing, or FAQ answers that just repeat the body.
4. It invents first-person experience ("we tried", "I visited").
5. The title or opening promises something specific (a number of items, a mistake, a cost, a comparison) that the body does not fully deliver, or the ending trails off without a concrete takeaway the reader can act on.

Minor style preferences are NOT a reason to fail.

[Verified source facts]
${facts.map((f, i) => `${i + 1}. ${f}`).join('\n') || '(none)'}

[Existing posts on the site — title | description]
${existingPosts.map((p) => `- ${p.title} | ${p.description || ''}`).join('\n') || '(none)'}

[Post under review]
TITLE: ${post.title}
DESCRIPTION: ${post.description}
BODY:
${post.body}
FAQ:
${(post.faq || []).map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n')}

Respond ONLY with JSON: {"pass": true|false, "issues": ["specific problem, quoting the offending text", ...]}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS[model],
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${model} 호출 실패: ${json.error?.message || res.status}`);
  const verdict = JSON.parse(json.choices[0].message.content);
  return { pass: verdict.pass === true, issues: verdict.issues || [] };
};

// 현재 내용에 대한 판정이 없는 검수자만 호출한다 — 불합격 판정도 기록하므로 글을 고치기 전엔 재호출하지 않는다.
const addReviews = async (post, context, onError) => {
  const hash = contentHash(post);
  const reviews = Array.isArray(post.reviews) ? [...post.reviews] : [];
  for (const reviewer of REVIEWERS) {
    if (reviews.some((r) => r.reviewer === reviewer && r.hash === hash)) continue;
    try {
      const verdict = await reviewPost(post, reviewer, context);
      reviews.push({ reviewer, hash, ...verdict, at: new Date().toISOString() });
    } catch (err) {
      onError(err);
    }
  }
  return { ...post, reviews };
};

module.exports = { reviewPost, addReviews, REVIEWERS };
