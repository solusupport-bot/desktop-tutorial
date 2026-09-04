#!/usr/bin/env node
// Pinterest 자격증명(PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID)이 실제로 작동하는지
// 확인하는 1회성 테스트 스크립트. lib/publishing/pinterest.js가 에러 메시지를
// err.response.data.message로만 축약해서 진단이 어려우므로, 여기서는 axios 요청을
// 직접 날려 Pinterest API의 원본 에러 응답 전체(code/message/status)를 그대로 출력한다.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');

const main = async () => {
  const accessToken = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;

  log.info(`Token length: ${accessToken ? accessToken.length : 0}, prefix: ${accessToken ? accessToken.slice(0, 10) : 'none'}`);
  log.info(`Board ID: ${boardId}`);

  try {
    const response = await axios.post(
      'https://api.pinterest.com/v5/pins',
      {
        board_id: boardId,
        title: 'Korea Travel Tip: T-money Card',
        description: 'T-money 교통카드 하나면 서울 지하철, 버스, 편의점 결제까지 다 됩니다.',
        media_source: {
          source_type: 'image_url',
          url: 'https://images.pexels.com/photos/7237170/pexels-photo-7237170.jpeg'
        },
        link: 'https://landinkorea.com/blog/tmoney-first-timer-mistake.html?utm_source=pinterest&utm_medium=social&utm_campaign=test'
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    log.ok(`성공! Pin ID: ${response.data.id}`);
    console.log('RESULT_JSON=' + JSON.stringify(response.data));
  } catch (err) {
    log.err('Pinterest API 원본 에러 응답:');
    console.log(JSON.stringify(err.response?.data || { message: err.message }, null, 2));
    console.log('HTTP status:', err.response?.status);
    process.exitCode = 1;
  }
};

main();
