// 2026-11-24 실측: 보충 스텝(ensure-*-daily)이 주제 1개에 55분~3시간씩 묶여 SNS Scheduler 한 번이
// 5~6시간 걸렸고, 그동안 다음 실행이 대기해 실제 발행이 하루 몇 번으로 줄었다(인스타 게시물이
// 안 올라간 원인 중 하나). 보충 스크립트에 시간 예산을 둔다: 예산이 지나면 새 주제를 시작하지 않고,
// 진행 중인 주제도 남은 예산을 넘기면 기다리지 않고 끝낸다(큐 저장은 주제 처리 마지막에만 일어나므로
// 중간에 끝내도 반쯤 만든 항목은 남지 않는다).
const log = require('../logger');

const createBudget = (minutes) => {
  const startedAt = Date.now();
  const budgetMs = Number(process.env.BACKFILL_BUDGET_MIN || minutes) * 60 * 1000;
  const remaining = () => budgetMs - (Date.now() - startedAt);
  const withinBudget = async (promise, label) => {
    const left = remaining();
    if (left <= 0) return { timedOut: true };
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), left); });
    const result = await Promise.race([promise.then((value) => ({ value })), timeout]);
    clearTimeout(timer);
    if (result.timedOut) log.warn(`시간 예산(${budgetMs / 60000}분) 초과 — 중단: ${label}`);
    return result;
  };
  return { remaining, withinBudget, exhausted: () => remaining() <= 0 };
};

module.exports = { createBudget };
