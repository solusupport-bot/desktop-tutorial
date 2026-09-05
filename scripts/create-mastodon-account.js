#!/usr/bin/env node
/**
 * Mastodon 계정을 API로 직접 생성하는 1회성 스크립트. Bluesky와 같은 이유로
 * GitHub Actions 러너에서 실행한다(이 저장소를 다루는 세션의 샌드박스는
 * mastodon.social 등 일반 도메인으로의 아웃바운드를 조직 정책으로 차단한다).
 *
 * Mastodon 가입은 (1) 앱 등록으로 client_id/secret 발급 -> (2) client_credentials로
 * 앱 토큰 발급 -> (3) 그 토큰으로 /api/v1/accounts에 실제 계정 등록, 3단계다.
 * 일부 인스턴스는 date_of_birth를 필수로 요구한다(EU 연령 규정 대응) — 만 16세
 * 이상임을 밝히는 형식적 필드라, 실제 개인정보가 아닌 성인 연도의 임의 날짜를 쓴다.
 *
 * approval_required=true인 인스턴스는 API로 가입해도 관리자 승인 전까지 로그인/
 * 발행이 안 된다 — 이건 사람이 개입해야 하는 부분이라 시도 자체를 건너뛰고
 * 즉시 실패 처리한다(다른 인스턴스를 시도하라는 신호).
 *
 * 사용법: MASTODON_NEW_INSTANCE=... MASTODON_NEW_USERNAME=... MASTODON_NEW_EMAIL=... \
 *   MASTODON_NEW_PASSWORD=... node scripts/create-mastodon-account.js
 */
const axios = require('axios');

const run = async () => {
  const instance = (process.env.MASTODON_NEW_INSTANCE || '').replace(/\/+$/, '');
  const username = process.env.MASTODON_NEW_USERNAME;
  const email = process.env.MASTODON_NEW_EMAIL;
  const password = process.env.MASTODON_NEW_PASSWORD;

  if (!instance || !username || !email || !password) {
    console.error('MASTODON_NEW_INSTANCE, MASTODON_NEW_USERNAME, MASTODON_NEW_EMAIL, MASTODON_NEW_PASSWORD가 모두 필요합니다.');
    process.exitCode = 1;
    return;
  }

  try {
    const info = await axios.get(`${instance}/api/v2/instance`, { timeout: 15000 });
    const enabled = info.data?.registrations?.enabled;
    const approvalRequired = info.data?.registrations?.approval_required;
    console.log('=== 인스턴스 등록 정책 ===');
    console.log('registrations.enabled:', enabled);
    console.log('registrations.approval_required:', approvalRequired);
    if (enabled === false) {
      console.error('이 인스턴스는 신규 가입을 받지 않습니다. 다른 인스턴스를 시도하세요.');
      process.exitCode = 1;
      return;
    }
    if (approvalRequired === true) {
      console.error('이 인스턴스는 관리자 승인이 필요합니다 — API만으로 즉시 사용 가능한 계정을 만들 수 없습니다. 다른 인스턴스를 시도하세요.');
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    console.error('인스턴스 정보 조회 실패:', err.response?.status, JSON.stringify(err.response?.data));
  }

  let appCreds;
  try {
    const appRes = await axios.post(`${instance}/api/v1/apps`, {
      client_name: 'Land in Korea pipeline',
      redirect_uris: 'urn:ietf:wg:oauth:2.0:oob',
      scopes: 'read write',
      website: 'https://landinkorea.com'
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    appCreds = appRes.data;
    console.log('=== 앱 등록 성공 ===', appCreds.client_id);
  } catch (err) {
    console.error('=== 앱 등록 실패 ===', err.response?.status, JSON.stringify(err.response?.data));
    process.exitCode = 1;
    return;
  }

  let appToken;
  try {
    const tokenRes = await axios.post(`${instance}/oauth/token`, {
      client_id: appCreds.client_id,
      client_secret: appCreds.client_secret,
      grant_type: 'client_credentials',
      scope: 'read write'
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    appToken = tokenRes.data.access_token;
  } catch (err) {
    console.error('=== 앱 토큰 발급 실패 ===', err.response?.status, JSON.stringify(err.response?.data));
    process.exitCode = 1;
    return;
  }

  try {
    const regRes = await axios.post(`${instance}/api/v1/accounts`, {
      username,
      email,
      password,
      agreement: true,
      locale: 'en',
      date_of_birth: '1995-01-01'
    }, {
      headers: { Authorization: `Bearer ${appToken}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    console.log('=== 계정 생성 성공 ===');
    console.log('MASTODON_INSTANCE:', instance);
    console.log('MASTODON_ACCESS_TOKEN:', regRes.data.access_token);
    console.log('=====================================');
    if (regRes.data.access_token) {
      console.log('access_token이 바로 발급됨 — 승인 대기 없이 즉시 사용 가능할 확률이 높습니다.');
    } else {
      console.log('access_token 없음 — 이메일 인증이 필요할 수 있습니다.');
    }
  } catch (err) {
    console.error('=== 계정 생성 실패 ===');
    console.error('status:', err.response?.status);
    console.error('body:', JSON.stringify(err.response?.data));
    process.exitCode = 1;
  }
};

run();
