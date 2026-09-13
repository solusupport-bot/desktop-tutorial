#!/usr/bin/env node
// 일회성 스크립트: 2026-09-13 test-video-publish.yml 검증 중 dedup 이력을 무시한
// publish-video-test.js가 이미 사용된 영상으로 실제 계정에 중복 게시물을 5세트
// 발행했다(사용자 신고: "같은 영상이 3번 이상 나옴"). 그 5세트를 전부 삭제한다.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');
const { GRAPH_API_BASE, INSTAGRAM_GRAPH_API_BASE } = require('../lib/publishing/meta_client');

const THREADS_API_BASE = 'https://graph.threads.com/v1.0';

const deleteThreadsPost = async (id, label) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  try {
    await axios.delete(`${THREADS_API_BASE}/${id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[threads ${label} ${id}] 삭제 성공`);
  } catch (err) {
    log.err(`[threads ${label} ${id}] 삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const deleteFacebookVideo = async (id, label) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  try {
    await axios.delete(`${GRAPH_API_BASE}/${id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[facebook ${label} ${id}] 삭제 성공`);
  } catch (err) {
    log.err(`[facebook ${label} ${id}] 삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const deleteInstagramMedia = async (id, label) => {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  try {
    await axios.delete(`${INSTAGRAM_GRAPH_API_BASE}/${id}`, { params: { access_token: accessToken }, timeout: 15000 });
    log.ok(`[instagram ${label} ${id}] 삭제 성공`);
  } catch (err) {
    log.err(`[instagram ${label} ${id}] 삭제 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

const TARGETS = [
  { label: '경복궁', threads: '18130801471663061', facebook: '1756270552253924', instagram: '17922708069199325' },
  { label: '북촌', threads: '18110788816856528', facebook: '1362459169302213', instagram: '18332899459279296' },
  { label: 'N서울타워', threads: '18114918391979164', facebook: '1831967411328257', instagram: '18138064183621604' },
  { label: '명동', threads: null, facebook: '2138438143693272', instagram: '18128434864768871' },
  { label: '에버랜드', threads: null, facebook: '1619037932937152', instagram: '18333517159258169' }
];

const main = async () => {
  for (const t of TARGETS) {
    if (t.threads) await deleteThreadsPost(t.threads, t.label);
    if (t.facebook) await deleteFacebookVideo(t.facebook, t.label);
    if (t.instagram) await deleteInstagramMedia(t.instagram, t.label);
  }
};

main();
