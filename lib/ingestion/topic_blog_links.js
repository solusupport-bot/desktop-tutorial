// SNS 주제(korea_travel.js의 topic 이름)를 실제 블로그 비교글 URL에 연결합니다.
// 매칭되는 블로그 글이 아직 없는 주제는 블로그 홈으로 대체 연결합니다 —
// 유통 계획(distribution playbook)의 "모든 SNS 게시물 말미에 블로그 링크 의무화" 항목.
const BLOG_BASE = 'https://solusupport-bot.github.io/desktop-tutorial/land-in-korea-blog/site';

const TOPIC_BLOG_LINKS = {
  'Airport transfer options': `${BLOG_BASE}/posts/incheon-airport-transfer-comparison.html`,
  'eSIM & mobile data': `${BLOG_BASE}/posts/korea-esim-comparison.html`,
  'T-money transit card': `${BLOG_BASE}/posts/tmoney-first-timer-mistake.html`,
  'Tax refund (Tax Free) shopping': `${BLOG_BASE}/posts/korea-tax-refund-mistake.html`,
  'Travel advisories & safety notices': `${BLOG_BASE}/posts/korea-safety-vs-weather-risk.html`,
  'First-timer etiquette & common mistakes': `${BLOG_BASE}/posts/korea-etiquette-mistakes.html`,
  'Currency & card payments': `${BLOG_BASE}/posts/korea-currency-card-payment-mistake.html`,
  'Emergency numbers & 24hr pharmacies': `${BLOG_BASE}/posts/korea-emergency-numbers-pharmacy-guide.html`,
  'Useful travel apps': `${BLOG_BASE}/posts/korea-travel-apps-comparison.html`,
  'Convenience store hacks': `${BLOG_BASE}/posts/korea-convenience-store-guide.html`,
  'Seasonal packing & weather tips': `${BLOG_BASE}/posts/korea-seasonal-packing-guide.html`,
  'Luggage storage & forwarding services': `${BLOG_BASE}/posts/korea-luggage-storage-forwarding.html`
};

const BLOG_HOME_URL = `${BLOG_BASE}/index.html`;

/** 주제에 맞는 블로그 글 URL을 반환합니다. 매칭되는 글이 없으면 블로그 홈을 반환합니다. */
const getBlogLinkForTopic = (topic) => TOPIC_BLOG_LINKS[topic] || BLOG_HOME_URL;

/** platform별 클릭 출처를 구분할 수 있도록 UTM 파라미터를 붙입니다. */
const withUtm = (url, platform) => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=${platform}&utm_medium=social&utm_campaign=auto_post`;
};

module.exports = { getBlogLinkForTopic, withUtm, TOPIC_BLOG_LINKS, BLOG_HOME_URL };
