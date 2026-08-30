#!/usr/bin/env node
// 일회성 스크립트: 취소 신호가 늦게 도착해 이미 발행된 중복 테스트 게시물(2026-08-30,
// "T-money transit card" 기본값 재사용으로 인한 중복)을 실제로 삭제한다.
// Threads/Facebook은 알려진 ID로 바로 삭제, Instagram은 media_publish까지 갔는지
// 불확실해서 최근 미디어 목록을 먼저 조회해 방금 만든 것으로 보이면 지운다.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');
const { GRAPH_API_BASE, INSTAGRAM_GRAPH_API_BASE, instagramGraphGet } = require('../lib/publishing/meta_client');

const THREADS_API_BASE = 'https://graph.threads.com/v1.0';

const deleteThreadsPost = async (id) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  try {
    await axios.delete(`${THREADS_API_BASE}/${id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[threads ${id}] 삭제 성공`);
  } catch (err) {
    log.err(`[threads ${id}] 삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const deleteFacebookVideo = async (id) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  try {
    await axios.delete(`${GRAPH_API_BASE}/${id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[facebook ${id}] 삭제 성공`);
  } catch (err) {
    log.err(`[facebook ${id}] 삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const checkAndDeleteRecentInstagram = async () => {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  try {
    const data = await instagramGraphGet(`/${igUserId}/media`, { fields: 'id,caption,timestamp', limit: 3 }, accessToken);
    const items = data.data || [];
    if (!items.length) {
      log.ok('[instagram] 최근 미디어 없음');
      return;
    }
    const newest = items[0];
    const ageMs = Date.now() - new Date(newest.timestamp).getTime();
    log.ok(`[instagram] 최신 미디어: ${newest.id} (${Math.round(ageMs / 1000)}초 전) caption="${(newest.caption || '').slice(0, 60)}"`);
    if (ageMs < 10 * 60 * 1000 && (newest.caption || '').includes('T-money card has money on it')) {
      await axios.delete(`${INSTAGRAM_GRAPH_API_BASE}/${newest.id}`, { params: { access_token: accessToken }, timeout: 15000 });
      log.ok(`[instagram ${newest.id}] 방금 만든 중복 게시물로 확인, 삭제 성공`);
    } else {
      log.ok('[instagram] 방금 만든 게시물 아님 (media_publish까지 안 갔던 것으로 보임) — 삭제 안 함');
    }
  } catch (err) {
    log.err(`[instagram] 조회/삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const main = async () => {
  await deleteThreadsPost('17942434452076604'); // reply (2페이지) 먼저
  await deleteThreadsPost('17991735411042589'); // 원 게시물
  await deleteFacebookVideo('2560585257787716');
  await checkAndDeleteRecentInstagram();
};

main();
