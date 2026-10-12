#!/usr/bin/env node
// Threads/Facebook 실측 인사이트(조회수 등)를 자동으로 긁어와 data/collected_insights.json에
// 쌓는다. 사람이 손으로 채우는 data/platform_performance.json(카테고리별 수동 집계, 카테고리
// 체계가 topic_bank.json의 category와 서로 다름)은 건드리지 않는다 — 잘못 매핑된 숫자를
// 기존 수동 통계에 섞어 넣는 위험을 피하기 위해, 원본 실측치만 별도 파일에 쌓고 해석/집계는
// 사람이 /performance 화면에서 직접 본다.
//
// 실행: node scripts/collect-insights.js
// 대시보드 /performance의 "지금 갱신" 버튼도 이 스크립트를 그대로 실행한다.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const log = require('../lib/logger');
const { loadQueue } = require('../lib/scheduler/queue');

const INSIGHTS_PATH = path.join(__dirname, '..', 'data', 'collected_insights.json');
const LOOKBACK_DAYS = 30;

const loadInsights = () => {
  try {
    return JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
};

const saveInsights = (data) => {
  fs.writeFileSync(INSIGHTS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
};

const fetchThreadsInsight = async (mediaId) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  if (!accessToken) return null;
  const res = await axios.get(`https://graph.threads.com/v1.0/${mediaId}/insights`, {
    params: { metric: 'views,likes,replies,reposts,quotes', access_token: accessToken },
    timeout: 15000
  });
  const byName = {};
  (res.data?.data || []).forEach((m) => { byName[m.name] = m.values?.[0]?.value ?? null; });
  return byName;
};

const fetchFacebookInsight = async (postId) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!accessToken) return null;
  // 2026-10-03 실측: post_impressions/post_engaged_users는 Meta가 폐기해 매번
  // "#100 The value must be a valid insights metric"로 실패하고 있었다(한 번도
  // 성공한 적 없음 — 그래서 FB 성과가 항상 깜깜이였다). 실제 API에 값을 직접
  // 호출해 지금 살아있는 metric만 골랐다.
  const res = await axios.get(`https://graph.facebook.com/v21.0/${postId}/insights`, {
    params: { metric: 'post_clicks,post_reactions_by_type_total,post_video_views', access_token: accessToken },
    timeout: 15000
  });
  const byName = {};
  (res.data?.data || []).forEach((m) => { byName[m.name] = m.values?.[0]?.value ?? null; });
  return byName;
};

// 2026-10-13: 주간 리뷰(weekly-review-report.js)가 "반응 없는 글"을 가리려면 Threads/Facebook 말고도
// 성과가 필요하다. 공개 API로 읽히는 Bluesky·Mastodon과, 자기 미디어 기본 필드(like/comments)를
// 토큰으로 읽는 Instagram을 추가. 지표 이름은 Threads와 같게(likes/replies/reposts) 맞춘다.
const fetchBlueskyInsight = async (uri) => {
  const res = await axios.get('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts', { params: { uris: uri }, timeout: 15000 });
  const p = res.data?.posts?.[0];
  return p ? { likes: p.likeCount || 0, replies: p.replyCount || 0, reposts: p.repostCount || 0, quotes: p.quoteCount || 0 } : null;
};

const fetchMastodonInsight = async (statusId) => {
  const instance = process.env.MASTODON_INSTANCE || 'https://mastodon.social';
  const res = await axios.get(`${instance.replace(/\/$/, '')}/api/v1/statuses/${statusId}`, { timeout: 15000 });
  return { likes: res.data.favourites_count || 0, replies: res.data.replies_count || 0, reposts: res.data.reblogs_count || 0 };
};

const fetchInstagramInsight = async (mediaId) => {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  if (!accessToken) return null;
  // IG_ACCESS_TOKEN은 Instagram 로그인 토큰이라 graph.facebook.com에선 "Cannot parse access token"이 난다.
  const res = await axios.get(`https://graph.instagram.com/v21.0/${mediaId}`, {
    params: { fields: 'like_count,comments_count', access_token: accessToken }, timeout: 15000
  });
  return { likes: res.data.like_count || 0, replies: res.data.comments_count || 0 };
};

const FETCHERS = {
  threads: fetchThreadsInsight,
  facebook: fetchFacebookInsight,
  bluesky: fetchBlueskyInsight,
  mastodon: fetchMastodonInsight,
  instagram: fetchInstagramInsight
};

// 발행 결과에 processedAt이 없는 글이 많아(예약 시각만 남음) 예전엔 그 글들을 통째로 건너뛰었다.
const publishedAt = (item) => item.processedAt || item.scheduledAt;

const main = async () => {
  const queue = loadQueue();
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const insights = loadInsights();
  let collected = 0;
  let skipped = 0;

  const candidates = queue.filter((item) => {
    if (item.status !== 'published' && item.status !== 'partial') return false;
    if (!publishedAt(item) || new Date(publishedAt(item)).getTime() < cutoff) return false;
    return item.platforms.some((p) => FETCHERS[p]);
  });

  for (const item of candidates) {
    for (const platform of item.platforms) {
      if (!FETCHERS[platform]) continue;
      const result = item.results?.[platform];
      const postId = result?.id;
      if (!postId || postId.startsWith('mock_')) { skipped += 1; continue; }

      // 자동화 트래픽 조절 규칙: 하루 수백 건을 연달아 두드리지 않게 호출 사이에 간격을 둔다.
      await new Promise((r) => setTimeout(r, 500));
      try {
        const metrics = await FETCHERS[platform](postId);
        if (!metrics) { skipped += 1; continue; }

        insights[`${platform}:${postId}`] = {
          platform,
          postId,
          topic: item.topic || null,
          pattern: item.qualityGate?.pattern || null,
          publishedAt: publishedAt(item),
          metrics,
          collectedAt: new Date().toISOString()
        };
        collected += 1;
        log.ok(`[${platform}] ${postId} 인사이트 수집 완료 (${item.topic || '주제 미상'})`);
      } catch (err) {
        skipped += 1;
        const apiError = err.response?.data?.error;
        log.warn(`[${platform}] ${postId} 인사이트 수집 실패: ${apiError?.message || err.message}`);
      }
    }
  }

  saveInsights(insights);
  log.ok(`인사이트 수집 완료 — 성공 ${collected}건, 스킵/실패 ${skipped}건 (data/collected_insights.json)`);
};

main().catch((err) => {
  log.err(`인사이트 수집 실패: ${err.message}`);
  process.exit(1);
});
