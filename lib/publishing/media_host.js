const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const log = require('../logger');

/**
 * landinkorea.com의 sns-media/ 폴더에 파일을 쓰고 Cloudflare Pages로 배포한 뒤,
 * 발행 플랫폼이 실제로 가져갈 수 있는지 200 응답까지 확인하고 URL을 돌려준다.
 */
const SITE_DIR = process.env.LANDINKOREA_SITE_DIR || 'C:/Users/추성준/OneDrive/바탕 화면/landinkorea_site';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '1fc45e0d4565a48335045c78ec9d6f27';
const MEDIA_DIR = 'sns-media';
const PUBLIC_BASE = `https://landinkorea.com/${MEDIA_DIR}`;

// 2026-09-30: land-in-korea는 Cloudflare Pages가 아니라 Worker(정적 assets 방식,
// wrangler.jsonc)로 서빙된다 — `wrangler pages deploy`는 "not a Pages project"로
// 매번 실패해 9/27 마이그레이션 이후 새 미디어가 하나도 실제 배포되지 않고 있었다.
// 업로드마다 사이트 전체를 배포한다. 여러 장은 uploadMediaFiles로 한 번에 배포한다.
const deploySite = () => {
  execFileSync('npx', ['-y', 'wrangler@latest', 'deploy'], {
    stdio: 'pipe',
    cwd: SITE_DIR,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID },
    shell: process.platform === 'win32',
    timeout: 5 * 60 * 1000
  });
};

const uploadMediaFile = async (buffer, relativePath) => {
  const target = path.join(SITE_DIR, MEDIA_DIR, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  deploySite();

  const url = `${PUBLIC_BASE}/${relativePath}`;
  await axios.head(url, { timeout: 30000 });
  log.ok(`미디어를 landinkorea.com으로 호스팅: ${url}`);
  return url;
};

/**
 * 여러 파일을 한 번의 배포로 올린다(위 "ponytail" 메모가 예고한 배치 버전) —
 * 카드뉴스처럼 한 세트가 9장이나 되는 경우 uploadMediaFile을 9번 부르면 Netlify CLI
 * 프로세스 기동 비용만 9번 들어 느리고 낭비다. 파일을 전부 써넣고 한 번만 배포한
 * 뒤, URL마다 실제로 가져와지는지 순서대로 HEAD 확인한다. 기존 uploadMediaFile
 * 호출부(watermark_images.js 등)는 그대로 두고, 여러 장을 한 세트로 다루는 새
 * 호출부(scripts/queue-card-news.js)만 이걸 쓴다.
 */
const uploadMediaFiles = async (files) => {
  files.forEach(({ buffer, relativePath }) => {
    const target = path.join(SITE_DIR, MEDIA_DIR, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
  });
  deploySite();

  const urls = [];
  for (const { relativePath } of files) {
    const url = `${PUBLIC_BASE}/${relativePath}`;
    await axios.head(url, { timeout: 30000 });
    urls.push(url);
  }
  log.ok(`미디어 ${files.length}개를 landinkorea.com으로 일괄 호스팅 완료`);
  return urls;
};

module.exports = { uploadMediaFile, uploadMediaFiles, deploySite, SITE_DIR, MEDIA_DIR, PUBLIC_BASE };
