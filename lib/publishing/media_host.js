const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const log = require('../logger');

/**
 * 2026-08-29~09-24에는 이 저장소의 media-assets 브랜치에 커밋하고 raw.githubusercontent.com
 * URL로 서빙했다. 2026-09-24 solusupport-bot 계정이 제한되면서 raw URL이 전부 404가 됐고
 * (Meta/Bluesky 등이 이미지를 못 가져와 발행 불가), 그래서 이미 Netlify CLI로 배포 중인
 * landinkorea.com의 sns-media/ 폴더로 옮겼다. 파일을 사이트 폴더에 쓰고 배포한 뒤,
 * 발행 플랫폼이 실제로 가져갈 수 있는지 200 응답까지 확인하고 URL을 돌려준다.
 */
const SITE_DIR = process.env.LANDINKOREA_SITE_DIR || 'C:/Users/추성준/OneDrive/바탕 화면/landinkorea_site';
const NETLIFY_SITE_ID = '197bcaf7-5c78-466b-8894-465fa706a6be';
const MEDIA_DIR = 'sns-media';
const PUBLIC_BASE = `https://landinkorea.com/${MEDIA_DIR}`;

// ponytail: 업로드마다 사이트 전체를 배포(Netlify가 바뀐 파일만 올려 수십 초) — 하루 업로드가 수십 건을 넘으면 모아서 한 번에 배포할 것.
const deploySite = () => {
  // Windows에서 npx(.cmd)는 shell로만 실행되고, shell은 인자를 따옴표 없이 이어 붙인다 — "바탕 화면"의 공백 때문에 직접 감싼다.
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
