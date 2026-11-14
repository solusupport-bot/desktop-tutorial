/**
 * 2026-11-14 사용자 결정: 스톡 영상이 없는 주제가 연달아 반려돼 Instagram이 하루 넘게
 * 멈췄다. 제휴사(Klook·KKday) 상품 갤러리 사진은 실제 한국 상품 사진이고 주제와 1:1로
 * 묶여 있어 "키워드 일치"가 구조적으로 보장된다. 주제가 상품과 맞으면 이 사진을 우선
 * 쓰고, Instagram은 이 경우에 한해 사진(캐로셀) 게시를 허용한다.
 *
 * 사진 목록은 data/partner_media.json(상품 페이지에서 수집 후 실제 다운로드로 검증한 것).
 * 제휴사 사이트는 자동 요청을 403으로 막으므로 실행 중에 긁어오지 않는다.
 * 저작권은 제휴사에 있으므로 캡션에 출처를 반드시 붙인다(creditFor).
 */
const fs = require('fs');
const path = require('path');
const log = require('../logger');

const DATA = path.join(__dirname, '..', '..', 'data', 'partner_media.json');

const loadProducts = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).products;

const findPartnerProduct = (topic) =>
  loadProducts().find((p) => new RegExp(p.match, 'i').test(String(topic || ''))) || null;

const creditFor = (product) => `📸 Photos: ${product.provider}`;

/** 주제에 맞는 제휴 상품 사진 중 아직 안 쓴 것 최대 count장. 없으면 null(기존 소싱으로 진행). */
const findPartnerMedia = (topic, usedUrls = [], count = 4) => {
  const product = findPartnerProduct(topic);
  if (!product) return null;
  const images = product.images.filter((u) => !usedUrls.includes(u)).slice(0, count);
  if (!images.length) {
    log.warn(`제휴 상품 사진 전부 사용됨 → 기존 소싱으로 진행: ${product.name}`);
    return null;
  }
  log.ok(`제휴 상품 사진 ${images.length}장 사용: ${product.provider} ${product.name}`);
  return { product, images, credit: creditFor(product) };
};

/** 아직 안 쓴 사진이 남은 제휴 상품과 맞는 주제가 있는지 — Instagram 주제 우선순위용. */
const hasUnusedPartnerMedia = (topic, usedUrls = []) => {
  const product = findPartnerProduct(topic);
  return Boolean(product && product.images.some((u) => !usedUrls.includes(u)));
};

module.exports = { findPartnerMedia, findPartnerProduct, hasUnusedPartnerMedia, creditFor };
