const log = require('../logger');
const { fetchCrowdForecast, buildCrowdContentAngles } = require('./tour_crowd');

/**
 * "Land in Korea" 브랜드용 실용 정보 소스.
 *
 * 이 저장소가 실행되는 CI(GitHub Actions) 환경은 일반 인터넷 접근이 가능하므로,
 * 실제 운영 시에는 아래 SOURCES의 참고 URL을 크롤링/RSS 구독해 최신 내용으로
 * 교체하는 것을 권장합니다 (CLAUDE.md의 Agent Reach 규칙 참고).
 *
 * 다만 이 시드 콘텐츠는 자주 바뀌지 않는 기초 사실(에버그린 정보) 위주로 작성했으며,
 * 특히 세금환급 한도·관광경보처럼 시점에 따라 달라질 수 있는 항목은 게시 전
 * 공식 채널(국세청, 외교부 등)에서 최신 수치를 확인한 뒤 발행할 것을 권장합니다.
 *
 * content는 주제당 여러 개의 "각도(angle)"를 배열로 담습니다. 같은 주제가 다시
 * 순환에 걸려도 서로 다른 사실/문장으로 재가공되도록, 호출부(topic_rotation.js)가
 * 누적 게시 횟수(seed)로 배열 중 하나를 골라 씁니다 — 주제가 반복돼도 본문이
 * 그대로 반복되지 않게 하기 위한 장치입니다.
 */
// 2026-09-15: 대시보드(dashboard/)의 기획(planning) 화면에서 주제를 추가/편집할 수 있도록
// data/topic_bank.json으로 옮겼다. 형식(topic/author/url/category/placeKeyword/content[])은 동일.
const SOURCES = require('../../data/topic_bank.json');

/**
 * Land in Korea 브랜드 주제 시드 콘텐츠를 반환합니다.
 * 실제 배포 환경에서는 이 함수를 실시간 크롤링/RSS 결과로 교체하세요.
 *
 * "Crowd forecasts" 주제만은 한국관광공사 TatsCnctrRateService를 매번 라이브로
 * 호출해 그 시점 실제 예측치로 채웁니다(하드코딩 아님). 호출 실패 시(키 문제,
 * 일시적 네트워크 오류 등) 이 주제만 이번 회차에서 빠지고 나머지 정적 주제는
 * 그대로 반환됩니다 — 전체 파이프라인이 죽지 않도록.
 */
const fetchKoreaTravelTopics = async () => {
  log.section('Land in Korea 주제 수집');
  log.ok(`시드 소스 ${SOURCES.length}건 로드 완료`);
  const topics = SOURCES.map((s) => ({
    source: s.topic,
    author: s.author,
    content: s.content,
    url: s.url,
    category: s.category,
    placeKeyword: s.placeKeyword
  }));

  const crowdItems = await fetchCrowdForecast();
  const crowdAngles = crowdItems && buildCrowdContentAngles(crowdItems);
  if (crowdAngles) {
    log.ok('한국관광공사 실시간 혼잡도 예측 데이터로 "Crowd forecasts" 주제 추가');
    topics.push({
      source: 'Crowd forecasts for popular attractions',
      author: 'Korea Tourism Organization (TourAPI)',
      content: crowdAngles,
      url: 'https://english.visitkorea.or.kr'
    });
  } else {
    log.warn('혼잡도 예측 데이터를 가져오지 못해 "Crowd forecasts" 주제를 이번 회차에서 건너뜁니다.');
  }

  return topics;
};

module.exports = { fetchKoreaTravelTopics, SOURCES };
