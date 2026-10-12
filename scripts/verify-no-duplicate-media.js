#!/usr/bin/env node
// 검증자 스크립트: data/queue.json 전체를 훑어 "서로 다른 주제/발행 건"인데
// 같은 이미지나 영상 URL을 쓴 사례가 있는지 확인한다(2026-09-02 사용자 요청 —
// "검증자 역할을 할 무언가가 필요해"). 같은 주제 인스턴스 안에서 Threads/Facebook이
// 같은 사진을 공유하는 건 의도된 동작이라 오탐으로 치지 않는다(createdAt이 거의
// 같은 시각인 항목끼리는 "같은 인스턴스"로 묶어 제외).
//
// 2026-09-09 수정: imageUrls/videoUrl(워터마크·음악 합성 후 raw.githubusercontent.com
// 호스팅 URL)은 처리 시점 타임스탬프가 파일명에 들어가 매번 새로 생기므로, 이 필드만
// 비교하면 같은 원본 사진/영상을 재사용해도 절대 걸리지 않는다 — 실제로 사용자가
// "중복된 사진 올리지마"라고 지적할 때까지 이 스크립트가 무의미한 검증만 하고 있었다.
// daily-auto-post.js가 남긴 sourceImageUrls/sourceVideoUrl(원본 Pexels/Pixabay URL)이
// 있으면 그것을 우선 검사하고, 없는 옛 큐 항목만 imageUrls/videoUrl로 폴백한다.
//
// 실행: node scripts/verify-no-duplicate-media.js
// 종료 코드: 진짜 중복을 찾으면 1, 없으면 0 — CI/워크플로에서 게이트로도 쓸 수 있다.
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { applyVerifyStatus } = require('../lib/scheduler/verify_status');
const { mediaKey } = require('../lib/ingestion/media_guard');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.json');

// 같은 실행에서 나온 항목 묶기. 2026-10-13: 예전엔 createdAt을 초 단위로 잘라 묶었는데, 한 주제를
// 플랫폼별로 등록하는 데 0.3초쯤 걸려 초 경계를 넘으면(02:43:10.975 → 02:43:11.012) 같은 글을
// "다른 발행 건의 중복"으로 오탐했다 — 같은 주제가 60초 안에 연달아 생긴 항목은 한 인스턴스로 본다.
const INSTANCE_GAP_MS = 60 * 1000;
// applyVerifyStatus가 큐를 새로 읽어 객체가 달라지므로 id로 찾는다.
const instanceKeyById = new Map();
const instanceKey = (item) => instanceKeyById.get(item.id);
const assignInstanceKeys = (queue) => {
  const sorted = [...queue].sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
  let current = null;
  let lastAt = 0;
  for (const item of sorted) {
    const at = Date.parse(item.createdAt);
    // 옛 항목엔 topic이 빠진 게 있어(undefined) 둘 다 있을 때만 주제 차이로 끊는다.
    const topicChanged = current && current.topic && item.topic && current.topic !== item.topic;
    if (!current || topicChanged || at - lastAt > INSTANCE_GAP_MS) {
      current = { topic: item.topic, key: item.createdAt };
    }
    if (!current.topic) current.topic = item.topic;
    lastAt = at;
    instanceKeyById.set(item.id, current.key);
  }
};

const main = () => {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  assignInstanceKeys(queue);

  const imagesByInstance = {};
  const videosByInstance = {};
  queue.forEach((item) => {
    const key = instanceKey(item);
    imagesByInstance[key] = imagesByInstance[key] || new Set();
    videosByInstance[key] = videosByInstance[key] || new Set();
    const sourceImages = item.sourceImageUrls || item.imageUrls || [];
    sourceImages.forEach((u) => imagesByInstance[key].add(u));
    const sourceVideo = item.sourceVideoUrl !== undefined ? item.sourceVideoUrl : item.videoUrl;
    if (sourceVideo) videosByInstance[key].add(sourceVideo);
  });

  const check = (byInstance, label) => {
    const owner = {}; // url -> 처음 발견된 instanceKey
    const dups = []; // { url, instances: [key, key] }
    Object.entries(byInstance).forEach(([key, urls]) => {
      urls.forEach((url) => {
        // 주소가 달라도 같은 사진/영상 번호면 중복이다(media_guard.mediaKey).
        const id = mediaKey(url);
        if (owner[id] && owner[id] !== key) {
          dups.push({ url, instances: [owner[id], key] });
        } else if (!owner[id]) {
          owner[id] = key;
        }
      });
    });
    return dups;
  };

  const imageDups = check(imagesByInstance, '이미지');
  const videoDups = check(videosByInstance, '영상');

  // 검증 하드 게이트: 중복으로 걸린 인스턴스(같은 초 단위 createdAt으로 묶인 배치)에
  // 속한 pending 항목만 verifyStatus='failed'로 기록한다(run.js가 읽어 발행을 막는다).
  const failedInstances = new Set();
  [...imageDups, ...videoDups].forEach((d) => d.instances.forEach((k) => failedInstances.add(k)));
  applyVerifyStatus((item) => failedInstances.has(instanceKey(item)));

  // 2026-10-13: 이미 발행이 끝난 과거 배치끼리의 중복은 지금 막을 방법이 없는데도 매일 FAIL로
  // 찍혀 진짜 경보를 묻었다 — 아직 발행 전(pending/approved/claimed) 항목이 낀 중복만 실패로 본다.
  const ACTIVE = ['pending', 'approved', 'claimed'];
  const activeInstances = new Set(queue.filter((item) => ACTIVE.includes(item.status)).map(instanceKey));
  const isActive = (d) => d.instances.some((k) => activeInstances.has(k));
  const pastDups = [...imageDups, ...videoDups].filter((d) => !isActive(d));
  if (pastDups.length) log.warn(`이미 발행된 과거 배치 간 중복 ${pastDups.length}건(조치 불가, 기록용)`);
  imageDups.splice(0, imageDups.length, ...imageDups.filter(isActive));
  videoDups.splice(0, videoDups.length, ...videoDups.filter(isActive));

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
