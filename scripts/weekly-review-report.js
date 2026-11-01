#!/usr/bin/env node
// 2026-10-13 사용자 규칙: "7일간 올린 게시물을 분석해서 반응이 없으면 잘못된 부분을 찾아 수정 —
// 카피, 이미지, 게시 시간, 영상 등 모든 요소. 잘된 것을 찾아 벤치마킹하는 것도 잊지 말 것."
// 이 스크립트는 그 분석의 재료만 만든다(판단·수정은 ops/local-cron/weekly-review.ps1이 부르는
// Claude 세션이 한다). 지난 7일 발행 글마다 요소(유형·시간·미디어·첫 줄·끝 줄)와 성과를 묶어
// data/weekly_reviews/YYYY-MM-DD.md로 남긴다.
// 실행: node scripts/weekly-review-report.js [일수=7]
const fs = require('fs');
const path = require('path');

const DAYS = Number(process.argv[2]) || 7;
const queue = require('../data/queue.json');
const insights = require('../data/collected_insights.json');

const since = Date.now() - DAYS * 24 * 60 * 60 * 1000;
const metricsByPost = {};
for (const row of Object.values(insights)) metricsByPost[`${row.platform}:${row.postId}`] = row.metrics || {};

const kstHour = (iso) => (new Date(iso).getUTCHours() + 9) % 24;
const lines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
const sum = (m) => ({
  views: m.views || 0,
  likes: m.likes || 0,
  comments: m.replies || m.comments || 0,
  shares: (m.reposts || 0) + (m.quotes || 0) + (m.shares || 0)
});

const posts = [];
for (const item of queue) {
  if (item.status !== 'published' || Date.parse(item.scheduledAt) < since) continue;
  for (const [platform, result] of Object.entries(item.results || {})) {
    const m = metricsByPost[`${platform}:${result?.id}`];
    const t = lines(item.text);
    posts.push({
      platform,
      topic: item.topic,
      pattern: item.qualityGate?.pattern || '-',
      hourKst: kstHour(item.scheduledAt),
      media: item.videoUrl ? 'video' : (item.imageUrls?.length ? `image x${item.imageUrls.length}` : 'text'),
      mediaSource: item.sourceVideoUrl && item.videoUrl ? item.sourceVideoUrl : (item.sourceImageUrls || [])[0] || '',
      firstLine: t[0] || '',
      lastLine: t.filter((l) => !l.startsWith('#') && !/link in bio/i.test(l)).slice(-1)[0] || '',
      measured: !!(m && Object.keys(m).length),
      ...sum(m || {}),
      url: result?.url || ''
    });
  }
}

const reaction = (p) => p.likes + p.comments + p.shares;
const measured = posts.filter((p) => p.measured);
const noReaction = measured.filter((p) => reaction(p) === 0);
const ranked = [...measured].sort((a, b) => reaction(b) - reaction(a) || b.views - a.views);

const groupBy = (key) => {
  const g = {};
  for (const p of measured) {
    const k = p[key];
    g[k] ||= { n: 0, views: 0, reactions: 0 };
    g[k].n += 1; g[k].views += p.views; g[k].reactions += reaction(p);
  }
  return Object.entries(g).map(([k, v]) => `| ${k} | ${v.n} | ${(v.views / v.n).toFixed(1)} | ${(v.reactions / v.n).toFixed(2)} |`).join('\n');
};

const row = (p) => `| ${p.platform} | ${p.pattern} | ${p.hourKst}시 | ${p.media} | ${p.views} | ${p.likes}/${p.comments}/${p.shares} | ${p.firstLine.slice(0, 70).replace(/\|/g, '/')} | ${p.lastLine.slice(0, 60).replace(/\|/g, '/')} |`;
const head = '| 플랫폼 | 유형 | 시간(KST) | 미디어 | 조회 | 좋아요/댓글/공유 | 첫 줄 | 끝 줄 |\n|---|---|---|---|---|---|---|---|';

// 2026-10-17: SNS 반응만 보고 블로그 자체 조회수는 한 번도 실측한 적이 없었다 — GoatCounter
// 스크립트는 land-in-korea-blog 템플릿에 이미 박혀 있지만(automation/config.json의
// goatcounter_code), 이 저장소의 어떤 스크립트도 그 API를 호출하지 않았다. 토큰이 아직
// 없으면(사용자가 goatcounter.com → Settings → API에서 발급해야 함) 조용히 건너뛰지 않고
// 뭘 해야 하는지 리뷰 안에 그대로 남긴다.
const GOATCOUNTER_CODE = process.env.GOATCOUNTER_CODE || 'land-in-korea';
const fetchBlogStats = async () => {
  const token = process.env.GOATCOUNTER_API_TOKEN;
  if (!token) {
    return `⚠️ 블로그 조회수 미확인 — GOATCOUNTER_API_TOKEN이 없음. `
      + `https://${GOATCOUNTER_CODE}.goatcounter.com/settings/api 에서 발급 후 .env에 추가하면 다음 리뷰부터 자동 반영됨.`;
  }
  try {
    const end = new Date();
    const start = new Date(end.getTime() - DAYS * 24 * 60 * 60 * 1000);
    const url = `https://${GOATCOUNTER_CODE}.goatcounter.com/api/v0/stats/total`
      + `?start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return `⚠️ 블로그 조회수 조회 실패 (HTTP ${res.status}) — 토큰 권한(stats 읽기)을 확인할 것.`;
    const data = await res.json();
    return `최근 ${DAYS}일 블로그 페이지뷰: ${data.total ?? '?'} (GoatCounter 실측, 봇 제외 ${data.total_unique_utc ?? '?'}명)`;
  } catch (err) {
    return `⚠️ 블로그 조회수 조회 중 오류: ${err.message}`;
  }
};

const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const finish = (blogStatsLine) => {
const md = `# 주간 성과 리뷰 재료 (${today}, 최근 ${DAYS}일)

발행 ${posts.length}건 · 성과 측정됨 ${measured.length}건 · 반응 0건 ${noReaction.length}건
(성과가 안 잡힌 플랫폼: ${[...new Set(posts.filter((p) => !p.measured).map((p) => p.platform))].join(', ') || '없음'})

## 블로그 (SNS와 별도)
${blogStatsLine}

## 잘된 글 (벤치마킹 대상)
${head}
${ranked.slice(0, 5).map(row).join('\n')}

## 반응 없는 글
${head}
${noReaction.slice(0, 15).map(row).join('\n')}

## 요소별 평균 (측정된 글만)
| 유형 | 글수 | 평균 조회 | 평균 반응 |
|---|---|---|---|
${groupBy('pattern')}

| 게시 시간(KST) | 글수 | 평균 조회 | 평균 반응 |
|---|---|---|---|
${groupBy('hourKst')}

| 미디어 | 글수 | 평균 조회 | 평균 반응 |
|---|---|---|---|
${groupBy('media')}

| 플랫폼 | 글수 | 평균 조회 | 평균 반응 |
|---|---|---|---|
${groupBy('platform')}
`;

const dir = path.join(__dirname, '..', 'data', 'weekly_reviews');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${today}.md`);
fs.writeFileSync(out, md);
console.log(md);
console.log(`저장: ${out}`);
};

fetchBlogStats().then(finish);
