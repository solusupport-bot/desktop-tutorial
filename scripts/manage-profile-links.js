#!/usr/bin/env node
// SNS 프로필(bio/website)에 걸려있는 링크를 조회하고, API로 업데이트 가능한
// 플랫폼(Facebook 페이지)은 실제로 landinkorea.com으로 바꾼다.
// Threads/Instagram은 Graph API에 bio 쓰기 엔드포인트가 없어서(2026년 기준
// 조회만 가능) 조회만 하고, 실제 변경은 사람이 앱에서 직접 해야 한다.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');

const NEW_URL = 'https://landinkorea.com';

const checkFacebook = async () => {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const before = await axios.get(`https://graph.facebook.com/v21.0/${pageId}`, {
    params: { fields: 'name,website', access_token: token },
    timeout: 15000
  });
  log.ok(`[facebook] 변경 전: ${JSON.stringify(before.data)}`);

  try {
    const update = await axios.post(`https://graph.facebook.com/v21.0/${pageId}`, null, {
      params: { website: NEW_URL, access_token: token },
      timeout: 15000
    });
    log.ok(`[facebook] 업데이트 응답: ${JSON.stringify(update.data)}`);
  } catch (err) {
    log.err(`[facebook] 업데이트 실패: ${err.response?.data?.error?.message || err.message}`);
  }

  const after = await axios.get(`https://graph.facebook.com/v21.0/${pageId}`, {
    params: { fields: 'name,website', access_token: token },
    timeout: 15000
  });
  log.ok(`[facebook] 변경 후: ${JSON.stringify(after.data)}`);
};

const checkThreads = async () => {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  const res = await axios.get(`https://graph.threads.com/v1.0/${userId}`, {
    params: { fields: 'username,threads_biography', access_token: token },
    timeout: 15000
  });
  log.ok(`[threads] 현재 프로필: ${JSON.stringify(res.data)}`);
  log.warn('[threads] Threads Graph API는 bio 쓰기 엔드포인트를 제공하지 않음(2026년 기준 조회만 가능) - 앱에서 직접 수정 필요.');
};

const checkInstagram = async () => {
  const userId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!userId || !token) {
    log.warn('[instagram] IG_USER_ID/IG_ACCESS_TOKEN 미설정 - 건너뜀.');
    return;
  }
  const res = await axios.get(`https://graph.instagram.com/v26.0/${userId}`, {
    params: { fields: 'username,biography,website', access_token: token },
    timeout: 15000
  });
  log.ok(`[instagram] 현재 프로필: ${JSON.stringify(res.data)}`);
  log.warn('[instagram] Instagram Graph API도 bio 쓰기 엔드포인트를 제공하지 않음 - 앱에서 직접 수정 필요.');
};

const main = async () => {
  const platform = process.argv[2] || 'all';
  try {
    if (platform === 'all' || platform === 'facebook') await checkFacebook();
    if (platform === 'all' || platform === 'threads') await checkThreads();
    if (platform === 'all' || platform === 'instagram') await checkInstagram();
  } catch (err) {
    log.err(`조회/업데이트 실패: ${err.response?.data?.error?.message || err.message}`);
    process.exitCode = 1;
  }
};

main();
