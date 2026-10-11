#!/usr/bin/env node
// 실제 계정의 팔로워 수/최근 게시물 조회수를 Meta Graph API로 직접 조회합니다.
// 로컬 Claude Code 세션은 (1) 실제 토큰이 GitHub Actions secrets에만 있고 로컬 .env는
// 빈 플레이스홀더뿐이고, (2) 세션 네트워크가 graph.threads.net/graph.facebook.com을
// 차단하고 있어 직접 조회가 불가능하다. 그래서 이 스크립트는 GitHub Actions 안에서
// 실행되어(check-sns-stats.yml, secrets 주입됨) 결과를 로그에 남기는 용도다
// (2026-09-11 사용자 요청: "너가 내 sns계정 확인을해봐, 조회수나 팔로우가 늘어나질않아").
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');

const safeCall = async (label, fn) => {
  try {
    const data = await fn();
    log.ok(`${label}`);
    console.log(JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    log.err(`${label} 실패: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
    return null;
  }
};

const main = async () => {
  log.section('SNS 계정 실측 데이터 조회 (Meta Graph API)');

  // --- Threads ---
  if (process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID) {
    await safeCall('[Threads] 프로필', async () => {
      const r = await axios.get(`https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}`, {
        params: { fields: 'username,threads_biography', access_token: process.env.THREADS_ACCESS_TOKEN }
      });
      return r.data;
    });

    await safeCall('[Threads] 계정 인사이트 (팔로워 수/총 조회수 등)', async () => {
      const r = await axios.get(`https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads_insights`, {
        params: { metric: 'followers_count,views,likes,replies,reposts,quotes', access_token: process.env.THREADS_ACCESS_TOKEN }
      });
      return r.data;
    });

    const recentThreads = await safeCall('[Threads] 최근 게시물 목록', async () => {
      const r = await axios.get(`https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`, {
        params: { fields: 'id,text,timestamp,permalink', limit: 10, access_token: process.env.THREADS_ACCESS_TOKEN }
      });
      return r.data;
    });

    if (recentThreads?.data?.length) {
      for (const post of recentThreads.data.slice(0, 5)) {
        await safeCall(`[Threads] 게시물 ${post.id} (${post.timestamp}) 인사이트`, async () => {
          const r = await axios.get(`https://graph.threads.net/v1.0/${post.id}/insights`, {
            params: { metric: 'views,likes,replies,reposts,quotes', access_token: process.env.THREADS_ACCESS_TOKEN }
          });
          return { text: post.text?.slice(0, 60), permalink: post.permalink, insights: r.data };
        });
      }
    }
  } else {
    log.warn('[Threads] THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID 없음 — 건너뜀');
  }

  // --- Facebook Page ---
  if (process.env.FB_PAGE_ACCESS_TOKEN && process.env.FB_PAGE_ID) {
    await safeCall('[Facebook] 페이지 정보 (팔로워/좋아요)', async () => {
      const r = await axios.get(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}`, {
        params: { fields: 'name,followers_count,fan_count', access_token: process.env.FB_PAGE_ACCESS_TOKEN }
      });
      return r.data;
    });

    // 2026-10-11: post_impressions류는 Meta가 더 이상 지원하지 않아 매번
    // "(#100) The value must be a valid insights metric"로 실패했다(실측 확인).
    // 유효한 대체 메트릭을 추측해서 또 틀리느니, 팔로워 3명뿐인 페이지의 글당
    // 인사이트는 가치가 낮으므로 제거 — 페이지 정보+게시물 목록만으로 충분.
    await safeCall('[Facebook] 최근 게시물 목록', async () => {
      const r = await axios.get(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/posts`, {
        params: { fields: 'id,message,created_time,permalink_url', limit: 10, access_token: process.env.FB_PAGE_ACCESS_TOKEN }
      });
      return r.data;
    });
  } else {
    log.warn('[Facebook] FB_PAGE_ACCESS_TOKEN 또는 FB_PAGE_ID 없음 — 건너뜀');
  }

  // --- Instagram ---
  // 2026-10-11: graph.facebook.com으로 조회하면 "Invalid OAuth access token - Cannot
  // parse access token"으로 실패했다(실측 확인) — 이 IG_ACCESS_TOKEN은 Instagram Login
  // 방식 토큰이라 lib/publishing/meta_client.js가 실제 발행에 쓰는 것과 같은 호스트
  // (graph.instagram.com)를 써야 한다.
  if (process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID) {
    await safeCall('[Instagram] 계정 정보 (팔로워/게시물 수)', async () => {
      const r = await axios.get(`https://graph.instagram.com/v26.0/${process.env.IG_USER_ID}`, {
        params: { fields: 'username,followers_count,media_count', access_token: process.env.IG_ACCESS_TOKEN }
      });
      return r.data;
    });
  } else {
    log.warn('[Instagram] 토큰 또는 IG_USER_ID 없음 — 건너뜀');
  }

  log.ok('조회 완료 — 위 결과를 workflow 로그에서 확인하세요.');
};

main().catch((err) => {
  log.err(`SNS 계정 확인 실패: ${err.message}`);
  process.exit(1);
});
