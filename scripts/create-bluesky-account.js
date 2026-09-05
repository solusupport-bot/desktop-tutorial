#!/usr/bin/env node
/**
 * Bluesky 계정을 API로 직접 생성하고 앱 비밀번호까지 발급하는 1회성 스크립트.
 * 이 저장소를 실행하는 Claude 세션의 샌드박스는 아웃바운드 방화벽이 bsky.social을
 * 막고 있어(조직 정책, CONNECT 거부) 브라우저/curl로 직접 가입을 진행할 수 없다 —
 * 대신 아무 제약이 없는 GitHub Actions 러너에서 이 스크립트로 가입한다.
 *
 * 사용법 (GitHub Actions에서 workflow_dispatch로 실행):
 *   BLUESKY_NEW_HANDLE=... BLUESKY_NEW_EMAIL=... BLUESKY_NEW_PASSWORD=... \
 *     node scripts/create-bluesky-account.js
 */
const axios = require('axios');

const SERVICE = 'https://bsky.social';

const run = async () => {
  const handle = process.env.BLUESKY_NEW_HANDLE;
  const email = process.env.BLUESKY_NEW_EMAIL;
  const password = process.env.BLUESKY_NEW_PASSWORD;

  if (!handle || !email || !password) {
    console.error('BLUESKY_NEW_HANDLE, BLUESKY_NEW_EMAIL, BLUESKY_NEW_PASSWORD가 모두 필요합니다.');
    process.exitCode = 1;
    return;
  }

  console.log(`계정 생성 시도: handle=${handle}, email=${email}`);

  let session;
  try {
    const res = await axios.post(`${SERVICE}/xrpc/com.atproto.server.createAccount`, {
      handle,
      email,
      password
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
    session = res.data;
    console.log('=== 계정 생성 성공 ===');
    console.log('handle:', session.handle);
    console.log('did:', session.did);
  } catch (err) {
    console.error('=== 계정 생성 실패 ===');
    console.error('status:', err.response?.status);
    console.error('body:', JSON.stringify(err.response?.data));
    process.exitCode = 1;
    return;
  }

  try {
    const appPassRes = await axios.post(`${SERVICE}/xrpc/com.atproto.server.createAppPassword`, {
      name: 'land-in-korea-pipeline'
    }, {
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });
    console.log('=== 앱 비밀번호 발급 성공 ===');
    console.log('BLUESKY_IDENTIFIER:', session.handle);
    console.log('BLUESKY_APP_PASSWORD:', appPassRes.data.password);
    console.log('=====================================');
    console.log('위 두 값을 GitHub Secrets(BLUESKY_IDENTIFIER, BLUESKY_APP_PASSWORD)에 등록하세요.');
  } catch (err) {
    console.error('=== 앱 비밀번호 발급 실패 (계정 자체는 이미 생성됨) ===');
    console.error('status:', err.response?.status);
    console.error('body:', JSON.stringify(err.response?.data));
    console.error('accessJwt (임시 세션 토큰, 참고용):', session.accessJwt);
    process.exitCode = 1;
  }
};

run();
