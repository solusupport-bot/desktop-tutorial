#!/usr/bin/env node
// 발행된 미디어의 실제 공개 URL(permalink)을 Graph API로 조회하는 진단용 스크립트.
// 발행 응답의 id만으로는 게시글이 실제로 보이는지 확인할 수 없어서, 사람이 링크를
// 눈으로 확인할 수 있도록 별도로 조회한다.
require('dotenv').config();
const { instagramGraphGet, graphPost } = require('../lib/publishing/meta_client');
const axios = require('axios');
const log = require('../lib/logger');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
};

const getInstagramPermalink = async (mediaId) => {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const data = await instagramGraphGet(`/${mediaId}`, { fields: 'permalink,timestamp,caption' }, accessToken);
  return data;
};

const getFacebookPermalink = async (postId) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const res = await axios.get(`https://graph.facebook.com/v21.0/${postId}`, {
    params: { fields: 'permalink_url', access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

const getThreadsPermalink = async (mediaId) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const res = await axios.get(`https://graph.threads.com/v1.0/${mediaId}`, {
    params: { fields: 'permalink', access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

const main = async () => {
  const opts = parseArgs();
  if (!opts.platform || !opts.id) {
    log.err('사용법: node scripts/get-permalink.js --platform instagram|facebook|threads --id <media_or_post_id>');
    process.exit(1);
  }

  try {
    let data;
    if (opts.platform === 'instagram') data = await getInstagramPermalink(opts.id);
    else if (opts.platform === 'facebook') data = await getFacebookPermalink(opts.id);
    else if (opts.platform === 'threads') data = await getThreadsPermalink(opts.id);
    else {
      log.err(`알 수 없는 플랫폼: ${opts.platform}`);
      process.exit(1);
    }
    log.ok(`조회 결과: ${JSON.stringify(data)}`);
  } catch (err) {
    log.err(`조회 실패: ${err.response?.data?.error?.message || err.message}`);
    process.exitCode = 1;
  }
};

main();
