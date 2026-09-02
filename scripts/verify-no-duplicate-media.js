#!/usr/bin/env node
// 검증자 스크립트: data/queue.json 전체를 훑어 "서로 다른 주제/발행 건"인데
// 같은 이미지나 영상 URL을 쓴 사례가 있는지 확인한다(2026-09-02 사용자 요청 —
// "검증자 역할을 할 무언가가 필요해"). 같은 주제 인스턴스 안에서 Threads/Facebook이
// 같은 사진을 공유하는 건 의도된 동작이라 오탐으로 치지 않는다(createdAt이 거의
// 같은 시각인 항목끼리는 "같은 인스턴스"로 묶어 제외).
//
// 실행: node scripts/verify-no-duplicate-media.js
// 종료 코드: 진짜 중복을 찾으면 1, 없으면 0 — CI/워크플로에서 게이트로도 쓸 수 있다.
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.json');

const instanceKey = (item) => item.createdAt.slice(0, 19); // 초 단위까지 — 같은 실행에서 나온 항목 묶기

const main = () => {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));

  const imagesByInstance = {};
  const videosByInstance = {};
  queue.forEach((item) => {
    const key = instanceKey(item);
    imagesByInstance[key] = imagesByInstance[key] || new Set();
    videosByInstance[key] = videosByInstance[key] || new Set();
    (item.imageUrls || []).forEach((u) => imagesByInstance[key].add(u));
    if (item.videoUrl) videosByInstance[key].add(item.videoUrl);
  });

  const check = (byInstance, label) => {
    const owner = {}; // url -> 처음 발견된 instanceKey
    const dups = []; // { url, instances: [key, key] }
    Object.entries(byInstance).forEach(([key, urls]) => {
      urls.forEach((url) => {
        if (owner[url] && owner[url] !== key) {
          dups.push({ url, instances: [owner[url], key] });
        } else if (!owner[url]) {
          owner[url] = key;
        }
      });
    });
    return dups;
  };

  const imageDups = check(imagesByInstance, '이미지');
  const videoDups = check(videosByInstance, '영상');

  if (!imageDups.length && !videoDups.length) {
    log.ok('중복 검증 통과 — 서로 다른 발행 건 사이에 재사용된 이미지/영상 없음.');
    process.exit(0);
  }

  log.err(`중복 발견: 이미지 ${imageDups.length}건, 영상 ${videoDups.length}건`);
  imageDups.forEach((d) => log.warn(`[이미지] ${d.url} — ${d.instances.join(' / ')}`));
  videoDups.forEach((d) => log.warn(`[영상] ${d.url} — ${d.instances.join(' / ')}`));
  process.exit(1);
};

main();
