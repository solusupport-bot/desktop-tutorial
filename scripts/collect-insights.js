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
  const res = await axios.get(`https://graph.facebook.com/v21.0/${postId}/insights`, {
    params: { metric: 'post_impressions,post_engaged_users', access_token: accessToken },
    timeout: 15000
  });
  const byName = {};
  (res.data?.data || []).forEach((m) => { byName[m.name] = m.values?.[0]?.value ?? null; });
  return byName;
};

const main = async () => {
  const queue = loadQueue();
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const insights = loadInsights();
  let collected = 0;
  let skipped = 0;

  const candidates = queue.filter((item) => {
    if (item.status !== 'published' && item.status !== 'partial') return false;
    if (!item.processedAt || new Date(item.processedAt).getTime() < cutoff) return false;
    return item.platforms.some((p) => p === 'threads' || p === 'facebook');
  });

  for (const item of candidates) {
    for (const platform of item.platforms) {
      if (platform !== 'threads' && platform !== 'facebook') continue;
      const result = item.results?.[platform];
      const postId = result?.id;
      if (!postId || postId.startsWith('mock_')) { skipped += 1; continue; }

      try {
        const metrics = platform === 'threads'
          ? await fetchThreadsInsight(postId)
          : await fetchFacebookInsight(postId);
        if (!metrics) { skipped += 1; continue; }

        insights[`${platform}:${postId}`] = {
          platform,
          postId,
          topic: item.topic || null,
          publishedAt: item.processedAt,
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
