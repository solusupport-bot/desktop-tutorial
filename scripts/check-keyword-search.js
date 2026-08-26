#!/usr/bin/env node
// threads_keyword_search 권한이 우리 앱에 승인됐는지 실제로 확인하는 진단 스크립트.
// 승인 안 됐으면 이 호출은 우리 계정 게시물만 반환한다 (공개 게시물 검색 불가).
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');

const THREADS_API_BASE = 'https://graph.threads.com/v1.0';

const main = async () => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const keyword = process.argv[2] || 'eSIM';
  if (!accessToken) {
    log.err('THREADS_ACCESS_TOKEN이 없습니다.');
    process.exit(1);
  }

  try {
    const res = await axios.get(`${THREADS_API_BASE}/keyword_search`, {
      params: { q: keyword, search_type: 'RECENT', access_token: accessToken },
      timeout: 15000
    });
    const posts = res.data?.data || [];
    log.ok(`검색 결과 ${posts.length}건`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    log.err(`검색 실패: ${err.response?.data?.error?.message || err.message}`);
    console.log(JSON.stringify(err.response?.data || {}, null, 2));
    process.exitCode = 1;
  }
};

main();
