// 실행: node lib/publishing/blog_quality.check.js — 검수 2회 게이트가 풀리면 실패한다.
const assert = require('assert');
const { checkReviews, contentHash } = require('./blog_quality');
const post = { title: 't', description: 'd', body: 'b', faq: [] };
const h = contentHash(post);
assert.strictEqual(checkReviews(post).length, 1, '검수 없음은 막혀야 함');
assert.strictEqual(checkReviews({ ...post, reviews: [{ reviewer: 'a', pass: true, hash: h }] }).length, 1, '1회는 막혀야 함');
assert.strictEqual(checkReviews({ ...post, reviews: [{ reviewer: 'a', pass: true, hash: h }, { reviewer: 'a', pass: true, hash: h }] }).length, 1, '같은 검수자 2회는 막혀야 함');
assert.strictEqual(checkReviews({ ...post, reviews: [{ reviewer: 'a', pass: true, hash: h }, { reviewer: 'b', pass: false, hash: h }] }).length, 1, '불합격 포함은 막혀야 함');
const two = [{ reviewer: 'a', pass: true, hash: h }, { reviewer: 'b', pass: true, hash: h }];
assert.strictEqual(checkReviews({ ...post, reviews: two }).length, 0, '서로 다른 2명 통과는 허용');
assert.strictEqual(checkReviews({ ...post, body: 'b!', reviews: two }).length, 1, '검수 후 수정은 막혀야 함');
console.log('blog_quality 검수 게이트 OK');
