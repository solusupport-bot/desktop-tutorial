#!/usr/bin/env node
// 일회성 스크립트: 2026-09-01 스케줄러 중복 발행 사고(수동 재시도 dispatch와
// 마침 그 순간 겹친 cron)로 두 번씩 나간 게시물 중 나중에 겹쳐 나간 쪽("2차")을
// 지운다. Threads는 이 앱 토큰으로 API 삭제 권한이 없는 걸로 이전에 확인됐지만,
// 그래도 시도는 하고 실패하면 사용자에게 수동 삭제를 안내한다.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');
const { GRAPH_API_BASE, INSTAGRAM_GRAPH_API_BASE } = require('../lib/publishing/meta_client');

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

const deleteFacebookPost = async (id) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  try {
    await axios.delete(`${GRAPH_API_BASE}/${id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[facebook ${id}] 삭제 성공`);
  } catch (err) {
    log.err(`[facebook ${id}] 삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const deleteInstagramPost = async (id) => {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  try {
    await axios.delete(`${INSTAGRAM_GRAPH_API_BASE}/${id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[instagram ${id}] 삭제 성공`);
  } catch (err) {
    log.err(`[instagram ${id}] 삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const main = async () => {
  // "2차"(마침 겹쳐 발행된 자동 cron 쪽)를 지우고 "1차"(수동 재시도 쪽)를 남긴다.
  await deleteThreadsPost('18331987438273737');
  await deleteFacebookPost('1504216911910154');
  await deleteInstagramPost('18362578414212601');
};

main();
