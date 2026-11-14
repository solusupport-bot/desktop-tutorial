// 2026-11-14: 제휴 상품 사진 매칭 재발 방지 — "workspaces"가 spa 상품에 걸리던 오매칭,
// JSON에 \b가 백스페이스로 저장돼 DMZ가 매칭 안 되던 버그를 같이 막는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { findPartnerProduct, findPartnerMedia, hasUnusedPartnerMedia } = require('./partner_media');

test('topics match the right partner product, and only whole words', () => {
  const cases = {
    'Cafes as workspaces in Korea': null,
    'Tipping in Korea': null,
    'Jjimjilbang etiquette': 'Aquafield Jjimjilbang',
    'DMZ and JSA tours': 'DMZ Tour',
    'Suwon Hwaseong Fortress': 'Hwaseong Fortress Day Tour',
    'Nami Island and Petite France day trip': 'Nami Island'
  };
  for (const [topic, want] of Object.entries(cases)) {
    assert.equal(findPartnerProduct(topic)?.name ?? null, want, topic);
  }
});

test('used photos are never returned again, and credit names the provider', () => {
  const first = findPartnerMedia('DMZ and JSA tours', [], 2);
  assert.equal(first.images.length, 2);
  assert.equal(first.credit, '📸 Photos: Klook');
  const second = findPartnerMedia('DMZ and JSA tours', first.images, 2);
  assert.ok(second.images.every((u) => !first.images.includes(u)));
  const all = findPartnerProduct('DMZ and JSA tours').images;
  assert.equal(findPartnerMedia('DMZ and JSA tours', all), null);
  assert.equal(hasUnusedPartnerMedia('DMZ and JSA tours', all), false);
});
