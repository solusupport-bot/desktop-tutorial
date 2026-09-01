#!/usr/bin/env node
require('dotenv').config();
const log = require('../lib/logger');
const { claimDuePosts } = require('../lib/scheduler/run');

const claimed = claimDuePosts();
log.ok(claimed ? '예약 발행 대상을 claim 처리했습니다 (변경사항 있음).' : 'claim할 예약 게시글이 없습니다.');
process.exit(0);
