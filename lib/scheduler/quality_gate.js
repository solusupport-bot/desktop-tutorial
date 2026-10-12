const { askAIForJSON } = require('../ai/llm');
const { runOllayaQualityGate } = require('../ai/ollaya');

// 2026-09-17 사용자 요청("하나씩 임무를 다하면 검증자가 필요", "나는 자동화가
// 목표"): queueOneTopic이 캡션을 만들고 나면 "이대로 발행해도 되는지"를 한 번
// 더 물어 최소한의 발행 전 품질 게이트를 둔다. 통과하면 queue_topic.js가 그
// 배치를 approved:true로 등록해 사람 검수 단계를 건너뛰고(자동화), 실패하거나
// GROQ_API_KEY가 없으면 기존 그대로 approved:false로 남아 사람이
// /review에서 본다(안전한 기본값 유지).
//
// 원래는 콘텐츠 생성(Claude)과 다른 AI(Gemini)로 자기검증 편향을 피하려 했으나,
// 사용자가 시도한 Google AI Studio 프로젝트 2곳(landinkorea, threads-auto)
// 모두 선불 크레딧이 소진돼 있어(둘 다 "prepayment credits are depleted") 당장
// 호출이 불가능했다 — 사용자가 "Claude로 검증"을 선택해 이미 작동 확인된
// ANTHROPIC_API_KEY를 재사용하도록 전환했다(2026-09-17). 2026-09-24 크레딧 소진으로 Groq 무료 등급(lib/ai/llm.js)으로 이전.
const QUALITY_PROMPT = (topic, captionSample) => `당신은 한국 여행 SNS 계정의 발행 전 마지막 품질 검수자입니다.
아래는 "${topic}" 주제로 자동 생성된 캡션입니다. 이 캡션을 그대로 발행해도 좋을지 판단하세요.

[캡션]
${captionSample}

판단 기준:
- 위에서 말한 "${topic}" 주제와 실제로 관련 있는 내용인가(엉뚱한 주제로 새지 않았는가)
- 문장이 자연스럽고 완성돼 있는가(끊기거나 반복되거나 깨진 텍스트가 없는가)
- 가격/시간/운영 여부 등 구체적 사실 주장이 과장되거나 의심스럽지 않은가
- 여행 콘텐츠로서 최소한의 유용성이 있는가

아래 JSON 형식으로만 응답하세요(설명 없이):
{ "pass": true 또는 false, "reason": "판단 이유 한 문장" }`;

/**
 * 주제 하나(배치 전체가 공유하는 대표 캡션)에 대해 발행 가능 여부를 판단한다.
 * Ollaya 로컬 모델이 충분히 확신하면 그 결과를 사용한다. 확신이 낮거나 로컬 모델을
 * 쓸 수 없을 때만 Groq로 넘긴다. 둘 다 판정하지 못하면 사람 검수로 남긴다.
 */
const runQualityGate = async (topic, captionSample) => {
  if (!captionSample) return null;

  let localResult = null;
  try {
    localResult = await runOllayaQualityGate(topic, captionSample);
    if (localResult?.decisive) {
      return {
        pass: localResult.pass,
        reason: localResult.pass ? '로컬 AI 품질 검사 통과' : '로컬 AI가 주제·문장·주장 품질 문제를 감지함',
        model: `ollaya/${localResult.model}`,
        confidence: localResult.confidence,
        checkedAt: new Date().toISOString()
      };
    }
  } catch (_) {
    // 로컬 서버나 모델 오류는 Groq 폴백에서 다시 판정한다.
  }

  try {
    const result = await askAIForJSON(QUALITY_PROMPT(topic, captionSample));
    if (!result) {
      if (!localResult) return null;
      return {
        pass: false,
        reason: `로컬 AI 판정 확신이 낮아 사람 검수 필요 (${Math.round(localResult.confidence * 100)}%)`,
        model: `ollaya/${localResult.model}`,
        confidence: localResult.confidence,
        checkedAt: new Date().toISOString()
      };
    }
    return { pass: result.pass === true, reason: result.reason || '', model: 'groq', checkedAt: new Date().toISOString() };
  } catch (err) {
    return {
      pass: false,
      reason: `추가 검증 호출 실패: ${err.message}`,
      model: localResult ? `ollaya/${localResult.model}+groq` : 'groq',
      checkedAt: new Date().toISOString()
    };
  }
};

// 2026-10-13 사용자 지시: "후킹이 들어가는 대신 후킹에 맞는 마무리까지 완벽하게", "사람들이 반응할
// 만한 글(좋아요·댓글·공유)". 위 게이트는 대표 캡션 1개의 주제·문장만 봐서, 미리 써둔 글 앞에 약속형
// 훅을 덧붙인 경우처럼 훅과 끝이 따로 노는 걸 못 잡았다 — 플랫폼별 초안 전부를 한 번에 본다.
const HOOK_PAYOFF_PROMPT = (topic, drafts) => `You review social posts for "Land in Korea" (topic: "${topic}") before publishing.
For EACH draft below, check:
1. hook: the first line makes a specific promise or names a specific confusion/mistake (not a generic teaser).
2. payoff: the rest delivers exactly what that hook promised (same count if a number is given, a fix if a worry is raised, the reason if a belief is flipped). Nothing promised is missing.
3. reaction: the closing gives readers a real reason to comment, save, or share (e.g. a specific experience question or a save-worthy takeaway), and does NOT command "like/share/tag".

[Drafts]
${Object.entries(drafts).map(([p, t]) => `### ${p}\n${t}`).join('\n\n')}

Respond ONLY with JSON: { "pass": true or false (false if ANY draft fails), "failures": ["platform: which check failed and why, quoting the text"] }`;

const runHookPayoffGate = async (topic, drafts) => {
  const entries = Object.entries(drafts || {}).filter(([, t]) => typeof t === 'string' && t.trim());
  if (!entries.length) return null;
  try {
    const result = await askAIForJSON(HOOK_PAYOFF_PROMPT(topic, Object.fromEntries(entries)));
    if (!result) return null;
    return {
      pass: result.pass === true,
      reason: result.pass === true ? '후킹-마무리-반응 유도 검사 통과' : `후킹-마무리 불일치/반응 유도 부족: ${(result.failures || []).join(' | ')}`,
      model: 'groq',
      checkedAt: new Date().toISOString()
    };
  } catch (err) {
    return { pass: false, reason: `후킹-마무리 검사 호출 실패: ${err.message}`, model: 'groq', checkedAt: new Date().toISOString() };
  }
};

/** 기존 품질 게이트를 통과한 경우에만 후킹-마무리 게이트까지 본다. 둘 다 판정 못 하면 null(사람 검수). */
const runPublishGates = async (topic, drafts) => {
  const general = await runQualityGate(topic, drafts.threads || drafts.instagram || Object.values(drafts)[0]);
  if (general && !general.pass) return general;
  const hook = await runHookPayoffGate(topic, drafts);
  if (hook && !hook.pass) return hook;
  return general || hook;
};

module.exports = { runQualityGate, runHookPayoffGate, runPublishGates };
