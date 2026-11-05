const { askAIForJSON } = require('./llm');
const log = require('../logger');

/**
 * 남의 게시물에 달 댓글 초안을 만든다 (scripts/engage-other-posts.js 전용).
 *
 * CLAUDE.md "다른 계정 게시물 자동 댓글" 절의 콘텐츠 안전장치를 그대로 따른다:
 * - 1인칭으로 "직접 해봤다" 같은 지어낸 경험을 쓰지 않는다 — facts에 없는 디테일은
 *   꾸미지 않는다.
 * - 댓글 상대의 글 언어를 감지해 그 언어로 답한다.
 * - 진짜 팔로우업처럼 끝맺어 대화로 보이게 한다.
 * - 블로그 링크는 facts가 그 글과 진짜 관련 있을 때만 제안하고, 광고 문구가 아니라
 *   팁을 건네는 투로 자연스럽게 섞는다 — 매 댓글에 억지로 넣지 않는다.
 */
const draftComment = async ({ postText, facts, blogUrl }) => {
  const factsBlock = (facts && facts.length)
    ? facts.map((f, i) => `${i + 1}. ${f}`).join('\n')
    : '(해당 주제에 대해 확인된 사실 없음 — 구체적인 숫자/디테일을 지어내지 말 것)';

  const prompt = `당신은 "Land in Korea"라는 한국 여행 가이드 블로그를 운영하는 사람입니다.
아래는 다른 사람이 SNS에 올린 게시물입니다. 이 글에 진짜 사람이 쓴 것처럼 자연스러운
댓글을 하나 작성하세요.

[원 게시물]
${postText}

[당신이 실제로 확인한 사실 — 이것만 근거로 쓸 것]
${factsBlock}

[블로그 글 링크 — 진짜 관련 있을 때만 자연스럽게 제안, 아니면 쓰지 말 것]
${blogUrl || '(없음)'}

규칙:
- 원 게시물의 언어를 감지해서 그 언어로 답하세요.
- "제가 직접 해봤는데" 같은 1인칭 경험담을 지어내지 마세요. 확인된 사실만 쓰고, 모르면
  일반적인 조언이나 공감으로 답하세요.
- 댓글 1~3문장. 광고처럼 들리지 않게. "제 블로그 보세요" 같은 홍보 문구 금지 — 링크를
  넣을 땐 "이거 정리해둔 글이 있는데 도움될 수도 있어요" 정도의 팁 톤으로.
- 진짜 궁금해서 되묻는 느낌의 짧은 후속 질문이나 공감으로 마무리하세요.
- JSON으로만 응답: {"language": "감지된 언어 코드(en/ko/vi 등)", "comment": "댓글 본문", "usedLink": true 또는 false}`;

  let result;
  try {
    result = await askAIForJSON(prompt);
  } catch (err) {
    // 2026-11-05 실측: Groq가 가끔 json_object 모드 검증에 실패해 !res.ok로 던진다
    // (여기서 안 잡으면 engage-other-posts.js의 후보 루프 전체가 그 한 건 때문에
    // 통째로 죽는다 — 남은 후보/플랫폼까지 다 건너뛰게 됨). 이 후보만 건너뛴다.
    log.warn(`댓글 초안 생성 실패(Groq): ${err.message}`);
    return null;
  }
  if (!result || !result.comment) return null;
  return {
    language: result.language || 'en',
    comment: result.comment.trim(),
    usedLink: Boolean(result.usedLink && blogUrl)
  };
};

module.exports = { draftComment };
