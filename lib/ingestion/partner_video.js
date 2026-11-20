/**
 * 2026-11-20 사용자 결정: 스톡 사이트에 한국 영상이 거의 없어 Instagram이 멈추자, 제휴 업체(부산
 * 소상공인 등)가 직접 찍어 사용을 허락한 영상을 최우선으로 쓰기로 했다. 목록은 data/partner_videos.json.
 *
 * 사람이 업체와 주제를 직접 짝지어 넣고 사용 동의(consentDate)까지 받은 영상이라, 소형 비전 모델의
 * 한국/주제 판정(media_guard)은 거치지 않는다 — 그 모델은 외국 영상도 통과시켰다(2026-11-20 실측).
 * 대신 consentDate가 없는 항목은 절대 쓰지 않는다. 출처는 캡션(@태그)과 첫 댓글(링크)에 붙인다.
 */
const fs = require('fs');
const path = require('path');
const log = require('../logger');
const { isUsed } = require('./media_guard');

const DATA = path.join(__dirname, '..', '..', 'data', 'partner_videos.json');
const RAW_BASE = 'https://raw.githubusercontent.com/solusupport-bot/desktop-tutorial/main/media/partner_videos/';

const loadPartnerVideos = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8')).videos || [];
  } catch (err) {
    return [];
  }
};

const videoUrlOf = (entry) => entry.url || (entry.file ? RAW_BASE + encodeURIComponent(entry.file) : null);

const creditLine = (entry) => `🎥 Video: ${[entry.partner, entry.instagram].filter(Boolean).join(' ')}`;

const firstCommentFor = (entry) => [creditLine(entry), entry.link ? `📍 ${entry.link}` : null].filter(Boolean).join('\n');

/** 주제에 맞고, 동의받았고, 아직 안 쓴 제휴 영상. 없으면 null(기존 소싱으로 진행). */
const findPartnerVideo = (topic, recentUrls = [], entries = loadPartnerVideos()) => {
  for (const entry of entries) {
    if (!entry.consentDate || !entry.match) continue;
    if (!new RegExp(entry.match, 'i').test(String(topic || ''))) continue;
    const url = videoUrlOf(entry);
    if (!url || isUsed(recentUrls, url)) continue;
    log.ok(`제휴 영상 사용: ${entry.partner} (${topic}) -> ${url}`);
    return { url, partner: entry.partner, credit: creditLine(entry), firstComment: firstCommentFor(entry) };
  }
  return null;
};

module.exports = { findPartnerVideo, loadPartnerVideos };
