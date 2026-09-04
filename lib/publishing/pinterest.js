const axios = require('axios');
const log = require('../logger');

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

/**
 * Pinterest는 Threads/Instagram과 달리 핀 자체에 외부 링크(link 필드)를 넣어도
 * 도달이 억제되지 않는다 — 오히려 Pinterest는 핀이 실제 웹사이트로 연결되는 것을
 * "정상 사용"으로 취급한다(검색엔진에 가까운 디스커버리 플랫폼이라 외부 링크가
 * 본질적인 기능). 그래서 유일하게 캡션이 아니라 구조화된 link 필드로 블로그 글
 * URL을 직접 넣는다 — SNS -> 블로그 유입 마찰이 가장 적은 채널이다.
 */
const publishToPinterest = async (item) => {
  const accessToken = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;
  const { text, imageUrl, imageUrls, blogUrl, topic } = item;

  const image = imageUrl || (imageUrls && imageUrls[0]);

  if (!accessToken || !boardId) {
    log.warn('PINTEREST_ACCESS_TOKEN 또는 PINTEREST_BOARD_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Pinterest 모의 발행]\n${(text || '').slice(0, 150)}...`);
    return { id: 'mock_pinterest_pin_id' };
  }

  if (!image) {
    log.err('Pinterest는 이미지가 필수입니다.');
    return null;
  }

  // 핀 제목은 Pinterest 검색 노출에 큰 영향을 준다 — 캡션 첫 문장을 100자 이내로 자른다
  // (Pinterest 권장 제목 길이 40-100자, 너무 길면 검색결과에서 잘림).
  const firstLine = (text || '').split('\n').find((l) => l.trim()) || topic || 'Korea Travel Tip';
  const title = firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine;

  // 설명(description)에는 캡션 전체를 넣는다 — Pinterest 검색은 설명 텍스트를
  // 인덱싱하므로 키워드가 풍부할수록 노출에 유리하다(권장 500자 이내).
  const description = (text || '').slice(0, 500);

  const data = {
    board_id: boardId,
    title,
    description,
    media_source: {
      source_type: 'image_url',
      url: image
    }
  };

  // 블로그 글이 있으면 link 필드로 직접 연결 — 없으면 블로그 홈으로 대체.
  if (blogUrl) {
    data.link = blogUrl;
  }

  try {
    const response = await axios.post(`${PINTEREST_API_BASE}/pins`, data, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    log.ok(`Pinterest 발행 완료 (Pin ID: ${response.data.id})`);
    return { id: response.data.id, url: `https://pinterest.com/pin/${response.data.id}` };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    log.err(`Pinterest 발행 실패: ${errorMsg}`);
    return null;
  }
};

module.exports = { publishToPinterest };
