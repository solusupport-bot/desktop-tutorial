#!/usr/bin/env node
/**
 * scripts/cleanup-guidebooks-opener.js가 API로 못 지운(status: delete_failed) Threads/
 * Instagram 게시물의 permalink를 읽어서 수동 삭제를 위한 링크를 남긴다(삭제 권한은
 * 없어도 조회 권한은 있다는 전제). 결과는 각 항목의 manualDeleteUrl 필드에 저장한다.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const log = require('../lib/logger');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.json');

const fetchThreadsPermalink = async (id) => {
  try {
    const res = await axios.get(`https://graph.threads.com/v1.0/${id}`, {
      params: { fields: 'permalink', access_token: process.env.THREADS_ACCESS_TOKEN },
      timeout: 15000
    });
    return res.data?.permalink || null;
  } catch (err) {
    log.warn(`[threads ${id}] permalink 조회 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

const fetchInstagramPermalink = async (id) => {
  try {
    const res = await axios.get(`https://graph.instagram.com/v26.0/${id}`, {
      params: { fields: 'permalink', access_token: process.env.IG_ACCESS_TOKEN },
      timeout: 15000
    });
    return res.data?.permalink || null;
  } catch (err) {
    log.warn(`[instagram ${id}] permalink 조회 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

const main = async () => {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  const stuck = queue.filter((item) => item.status === 'delete_failed');
  log.section(`수동 삭제 대상 ${stuck.length}건 permalink 조회`);

  for (const item of stuck) {
    if ((item.platforms || []).includes('threads')) {
      const id = item.results?.threads?.id;
      if (id) {
        const permalink = await fetchThreadsPermalink(id);
        if (permalink) {
          item.manualDeleteUrl = permalink;
          log.ok(`[${item.id}] ${permalink}`);
        }
      }
    }
    if ((item.platforms || []).includes('instagram') && item.results?.instagram?.id) {
      const permalink = await fetchInstagramPermalink(item.results.instagram.id);
      if (permalink) {
        item.manualDeleteUrl = permalink;
        log.ok(`[${item.id}] ${permalink}`);
      }
    }
  }

  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
  log.ok('완료');
};

main().catch((err) => {
  log.err(`실패: ${err.message}`);
  process.exitCode = 1;
});
