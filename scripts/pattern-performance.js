#!/usr/bin/env node
// 2026-10-13: 벤치마킹으로 넣은 후킹 유형(A~E, data/engagement_benchmark_2026-10.md)이 우리 계정에서
// 실제로 먹히는지 가려낸다. collect-insights.js가 모은 성과를 유형·플랫폼별로 묶어 평균을 낸다.
// 유형 꼬리표는 2026-10-13 이후 발행분부터 붙으므로 그 전 글은 "미분류"로 나온다.
// 실행: node scripts/pattern-performance.js
const insights = require('../data/collected_insights.json');

const LABELS = { A: '경고형', B: '가격 대비', C: '반대 의견', D: '신기한 규칙', E: '사기·손해 경고', O: '기타' };
// 표본이 이보다 적으면 평균이 우연에 크게 흔들리므로 결론을 내지 않는다.
const MIN_SAMPLE = 5;

const groups = {};
for (const row of Object.values(insights)) {
  const m = row.metrics || {};
  if (!Object.keys(m).length) continue;
  const key = `${row.platform}|${row.pattern || '-'}`;
  const g = (groups[key] ||= { n: 0, views: 0, likes: 0, comments: 0, shares: 0 });
  g.n += 1;
  g.views += m.views || m.impressions || m.post_impressions || 0;
  g.likes += m.likes || m.reactions || m.post_reactions_like_total || 0;
  g.comments += m.replies || m.comments || 0;
  g.shares += (m.reposts || 0) + (m.quotes || 0) + (m.shares || 0);
}

const rows = Object.entries(groups).map(([key, g]) => {
  const [platform, pattern] = key.split('|');
  const avg = (v) => (v / g.n).toFixed(1);
  const reactions = g.likes + g.comments + g.shares;
  return {
    플랫폼: platform,
    유형: pattern === '-' ? '미분류' : `${pattern} ${LABELS[pattern] || ''}`,
    글수: g.n,
    평균조회: avg(g.views),
    평균좋아요: avg(g.likes),
    평균댓글: avg(g.comments),
    평균공유: avg(g.shares),
    반응률: g.views ? `${((reactions / g.views) * 100).toFixed(2)}%` : '-',
    판단: g.n >= MIN_SAMPLE ? '' : `표본 부족(<${MIN_SAMPLE})`
  };
}).sort((a, b) => a.플랫폼.localeCompare(b.플랫폼) || b.글수 - a.글수);

console.table(rows);
