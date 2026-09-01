#!/usr/bin/env node
require('dotenv').config();
const log = require('../lib/logger');
const { publishClaimedPosts } = require('../lib/scheduler/run');

publishClaimedPosts()
  .then((changed) => {
    log.ok(changed ? '예약 발행 처리 완료 (변경사항 있음)' : '발행할 claimed 게시글이 없습니다.');
    process.exit(0);
  })
  .catch((err) => {
    log.err(`스케줄러 실행 실패: ${err.message}`);
    process.exit(1);
  });
