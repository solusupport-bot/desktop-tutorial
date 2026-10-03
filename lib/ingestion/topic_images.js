/**
 * "Land in Korea" 주제별 대표 이미지 매핑 — 최후의 폴백(Pexels/Pixabay/Odii 라이브
 * 검색이 전부 실패했을 때만 사용됨).
 * korea_travel.js의 SOURCES[].topic 값과 동일한 키를 사용합니다.
 * 전부 Pexels에서 실제로 검색해 구한 사진입니다(2026-08-22 최초 4개는 Higgsfield
 * AI 생성 이미지였으나 실제 사진들과 안 어울린다는 지적으로 이후 전부 실사진으로
 * 전환, 2026-09-02 나머지 15개 주제도 동일 기준으로 채움).
 *
 * 2026-10-02: 값이 문자열 1개뿐이면, 그 주제의 전용 검색어(TOPIC_QUERIES)가 좁아서
 * 후보가 빨리 바닥나는 주제(예: "Gyeongbokgung Palace"는 등장 3번 만에 Pexels/Pixabay
 * 둘 다 실패해 폴백에 떨어졌다 — 영구 중복방지 이력 때문에 이미 쓴 사진은 다시 안
 * 골라서)가 매번 "같은 폴백 사진"을 반복해 사용자가 "중복되는 사진이 많다"고 지적한
 * 원인이 됐다. 배열로 바꿔 여러 장을 두고, 호출부(queue_topic.js resolveImages)가
 * recent에 없는 것부터 순서대로 시도하게 한다.
 */
const TOPIC_IMAGES = {
  "eSIM & mobile data": ["https://d8j0ntlcm91z4.cloudfront.net/user_3Fo4ThsH9a12FnQnrCDVGFESZ8E/hf_20260822_115024_19ce33ee-cc0f-4e54-b6e3-ca3a4d4b3fa5.png"],
  "T-money transit card": [
    "https://d8j0ntlcm91z4.cloudfront.net/user_3Fo4ThsH9a12FnQnrCDVGFESZ8E/hf_20260822_115024_e35a612a-cede-4a12-b4b2-1816d70a0103.png",
    "https://images.pexels.com/photos/32133700/pexels-photo-32133700.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "https://images.pexels.com/photos/31768197/pexels-photo-31768197.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
  ],
  "Tax refund (Tax Free) shopping": ["https://d8j0ntlcm91z4.cloudfront.net/user_3Fo4ThsH9a12FnQnrCDVGFESZ8E/hf_20260822_115023_6b520b0b-25db-411e-bcf3-83199d72c30f.png"],
  "Travel advisories & safety notices": ["https://d8j0ntlcm91z4.cloudfront.net/user_3Fo4ThsH9a12FnQnrCDVGFESZ8E/hf_20260822_115024_b3a9c9c9-4bbf-44a1-92fd-d3aca9220fc4.png"],
  "Gyeongbokgung Palace": [
    "https://images.pexels.com/photos/31990866/pexels-photo-31990866.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "https://images.pexels.com/photos/34259246/pexels-photo-34259246.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "https://images.pexels.com/photos/33019230/pexels-photo-33019230.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
  ],
  "Bukchon Hanok Village": ["https://images.pexels.com/photos/20325768/pexels-photo-20325768.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "N Seoul Tower (Namsan)": ["https://images.pexels.com/photos/35396704/pexels-photo-35396704.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Myeongdong shopping district": ["https://images.pexels.com/photos/33019190/pexels-photo-33019190.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Busan Haeundae Beach & Gamcheon Culture Village": ["https://images.pexels.com/photos/29188035/pexels-photo-29188035.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Jeju Island": ["https://images.pexels.com/photos/33097914/pexels-photo-33097914.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Airport transfer options": ["https://images.pexels.com/photos/11214073/pexels-photo-11214073.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "First-timer etiquette & common mistakes": ["https://images.pexels.com/photos/20285070/pexels-photo-20285070.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Currency & card payments": ["https://images.pexels.com/photos/31768194/pexels-photo-31768194.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Emergency numbers & 24hr pharmacies": ["https://images.pexels.com/photos/31971670/pexels-photo-31971670.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Useful travel apps": ["https://images.pexels.com/photos/19271594/pexels-photo-19271594.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Convenience store hacks": ["https://images.pexels.com/photos/31735910/pexels-photo-31735910.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Seasonal packing & weather tips": ["https://images.pexels.com/photos/21011587/pexels-photo-21011587.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "Luggage storage & forwarding services": ["https://images.pexels.com/photos/8799349/pexels-photo-8799349.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  "KTX vs. SRT vs. intercity bus for long-distance travel": ["https://images.pexels.com/photos/36621878/pexels-photo-36621878.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"]
};

module.exports = { TOPIC_IMAGES };
