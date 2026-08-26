#!/usr/bin/env node
// 이번 세션 중 파이프라인 검증용으로 올렸던 한글 테스트 게시물 4건을
// 영어로 고치는 일회성 스크립트. Land in Korea는 외국인 관광객 대상
// 영어 계정이라 한글 게시물이 브랜드에 안 맞는다.
//
// 시도 순서: 1) 캡션/텍스트 편집 API가 있으면 그걸로 즉시 수정
//          2) 편집이 안 되면 삭제 후 같은 자리에 영어로 재발행
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');
const { graphPost, instagramGraphPost, instagramGraphGet, INSTAGRAM_GRAPH_API_BASE, GRAPH_API_BASE } = require('../lib/publishing/meta_client');
const { publishToInstagram } = require('../lib/publishing/instagram');
const { publishToFacebook } = require('../lib/publishing/facebook');
const { publishToThreads } = require('../lib/publishing/threads');
const { getPermalink } = require('../lib/publishing/permalink');

const THREADS_API_BASE = 'https://graph.threads.com/v1.0';

const TARGETS = [
  {
    platform: 'instagram',
    id: '17881319580620592',
    englishText: 'Instagram automated publishing test. Sent from Land in Korea. #landinkorea #automation #test'
  },
  {
    platform: 'threads',
    id: '18102723821195815',
    englishText: 'Land in Korea automated publishing test — confirming simultaneous delivery across Threads, Facebook, and Instagram.'
  },
  {
    platform: 'facebook',
    id: '122106057747446391',
    englishText: 'Land in Korea automated publishing test — confirming simultaneous delivery across Threads, Facebook, and Instagram.'
  },
  {
    platform: 'instagram',
    id: '18105629429602808',
    englishText: 'Land in Korea automated publishing test — confirming simultaneous delivery across Threads, Facebook, and Instagram.'
  }
];

const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1080&q=80';

const fixInstagram = async (target) => {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  // 1) 캡션 편집 시도 (공개적으로 지원되지 않는 걸로 알려져 있지만 실제로 확인)
  try {
    await instagramGraphPost(`/${target.id}`, { caption: target.englishText }, accessToken);
    log.ok(`[instagram ${target.id}] 캡션 편집 성공`);
    return { action: 'edited' };
  } catch (editErr) {
    log.warn(`[instagram ${target.id}] 캡션 편집 실패: ${editErr.response?.data?.error?.message || editErr.message}`);
  }
  // 2) 삭제 후 영어로 재발행
  try {
    await axios.delete(`${INSTAGRAM_GRAPH_API_BASE}/${target.id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[instagram ${target.id}] 삭제 성공`);
  } catch (delErr) {
    log.err(`[instagram ${target.id}] 삭제 실패: ${delErr.response?.data?.error?.message || delErr.message}`);
    return { action: 'failed' };
  }
  const republished = await publishToInstagram({ text: target.englishText, imageUrl: TEST_IMAGE_URL });
  return republished ? { action: 'deleted_and_republished', newId: republished.id } : { action: 'deleted_only' };
};

const fixThreads = async (target) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  // 1) 텍스트 편집 시도
  try {
    await axios.post(`${THREADS_API_BASE}/${target.id}`, new URLSearchParams({ text: target.englishText, access_token: accessToken }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    });
    log.ok(`[threads ${target.id}] 텍스트 편집 성공`);
    return { action: 'edited' };
  } catch (editErr) {
    log.warn(`[threads ${target.id}] 텍스트 편집 실패: ${editErr.response?.data?.error?.message || editErr.message}`);
  }
  // 2) 삭제 후 영어로 재발행
  try {
    await axios.delete(`${THREADS_API_BASE}/${target.id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[threads ${target.id}] 삭제 성공`);
  } catch (delErr) {
    log.err(`[threads ${target.id}] 삭제 실패: ${delErr.response?.data?.error?.message || delErr.message}`);
    return { action: 'failed' };
  }
  const republished = await publishToThreads({ text: target.englishText, imageUrl: TEST_IMAGE_URL });
  return republished ? { action: 'deleted_and_republished', newId: republished.id } : { action: 'deleted_only' };
};

const fixFacebook = async (target) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  // 사진 게시글은 target.id가 사진 객체 id라 message 편집이 사진 객체에 먹는지 확인 필요.
  // 먼저 post_id를 조회해서 실제 페이지 게시글 id로 편집을 시도한다.
  let realPostId = target.id;
  try {
    const lookup = await axios.get(`${GRAPH_API_BASE}/${target.id}`, {
      params: { fields: 'post_id', access_token: accessToken },
      timeout: 15000
    });
    if (lookup.data?.post_id) realPostId = lookup.data.post_id;
  } catch (lookupErr) {
    log.warn(`[facebook ${target.id}] post_id 조회 실패, 원래 id로 편집 시도: ${lookupErr.response?.data?.error?.message || lookupErr.message}`);
  }

  try {
    await graphPost(`/${realPostId}`, { message: target.englishText }, accessToken);
    log.ok(`[facebook ${target.id}] 메시지 편집 성공 (post_id=${realPostId})`);
    return { action: 'edited' };
  } catch (editErr) {
    log.warn(`[facebook ${target.id}] 메시지 편집 실패: ${editErr.response?.data?.error?.message || editErr.message}`);
  }
  try {
    await axios.delete(`${GRAPH_API_BASE}/${realPostId}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[facebook ${target.id}] 삭제 성공`);
  } catch (delErr) {
    log.err(`[facebook ${target.id}] 삭제 실패: ${delErr.response?.data?.error?.message || delErr.message}`);
    return { action: 'failed' };
  }
  const republished = await publishToFacebook({ text: target.englishText, imageUrl: TEST_IMAGE_URL });
  return republished ? { action: 'deleted_and_republished', newId: republished.id } : { action: 'deleted_only' };
};

const main = async () => {
  const results = [];
  for (const target of TARGETS) {
    log.section(`${target.platform} ${target.id} 수정 중`);
    let result;
    if (target.platform === 'instagram') result = await fixInstagram(target);
    else if (target.platform === 'threads') result = await fixThreads(target);
    else if (target.platform === 'facebook') result = await fixFacebook(target);

    // API로 편집/삭제가 안 되는 플랫폼이면, 사람이 앱에서 직접 지우도록 실제 링크를 알려준다.
    if (result.action === 'failed') {
      try {
        const permalinkData = await getPermalink(target.platform, target.id);
        result.permalink = permalinkData.permalink || permalinkData.permalink_url || null;
      } catch (linkErr) {
        log.warn(`[${target.platform} ${target.id}] permalink 조회도 실패: ${linkErr.response?.data?.error?.message || linkErr.message}`);
      }
    }
    results.push({ ...target, ...result });
  }
  console.log('FIX_RESULTS_JSON=' + JSON.stringify(results));
};

main();
