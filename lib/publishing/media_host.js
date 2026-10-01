const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const log = require('../logger');

// Netlify 배포를 통한 미디어 호스팅 (landinkorea.com)
// 로컬 PC 전제: LANDINKOREA_SITE_DIR + netlify CLI 로그인 필수
const SITE_DIR = process.env.LANDINKOREA_SITE_DIR || 'C:/Users/추성준/OneDrive/바탕 화면/landinkorea_site';
const NETLIFY_SITE_ID = '197bcaf7-5c78-466b-8894-465fa706a6be';
const MEDIA_DIR = 'sns-media';
const PUBLIC_BASE = `https://landinkorea.com/${MEDIA_DIR}`;

const deploySite = () => {
  execFileSync('npx', ['-y', 'netlify-cli@latest', 'deploy', '--prod', '--no-build', '--dir', `"${SITE_DIR}"`, '--site', NETLIFY_SITE_ID], {
    stdio: 'pipe',
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

// 여러 파일을 한 번의 배포로 올린다 (카드뉴스 9장 등)
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
