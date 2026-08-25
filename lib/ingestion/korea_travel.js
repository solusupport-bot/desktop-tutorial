const log = require('../logger');

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
const SOURCES = [
  {
    topic: 'eSIM & mobile data',
    author: 'Land in Korea Desk',
    url: 'https://www.klook.com/en-US/blog/esim-korea/',
    content: [
      "eSIM, physical SIM, or pocket Wi-Fi — most people pick based on price and regret it by day 3. Most Korean eSIM plans for tourists can be purchased online before arrival and activated by scanning a QR code once you land — no physical SIM swap needed. Coverage matches the big three Korean carriers (SKT, KT, LG U+). Typical tourist plans run 5-8 days with unlimited or high-cap data. Keep your home number active by using a secondary eSIM slot rather than replacing your primary SIM.",
      "Rent a Wi-Fi egg for the group and forget to return it, and that 'free' shared data plan gets an expensive asterisk. If your phone doesn't support eSIM, physical prepaid SIM/Wi-Fi egg pickup counters are available at Incheon and Gimpo arrivals — reserve online for a discount and a shorter line. Pocket Wi-Fi routers let a group share one connection instead of buying separate SIMs. Return the router at the same airport counter or a marked drop box before your flight to avoid a late fee."
    ]
  },
  {
    topic: 'T-money transit card',
    author: 'Land in Korea Desk',
    url: 'https://www.seoulmetro.co.kr',
    content: [
      "One T-money habit almost every first-timer skips costs them real money on their last day in Korea. T-money is a rechargeable transit card sold at convenience stores (GS25, CU, 7-Eleven) and subway station kiosks for a small card fee. It works on subway, city buses, and many taxis nationwide — tap in and tap out, transfers between subway and bus within the transfer window are discounted. Balance and recharge are done with cash or card at convenience stores or station machines; unused balance can be partially refunded before leaving Korea.",
      "T-money isn't just a subway card — most tourists use maybe a third of what it actually does. It also works as a light payment card at some convenience stores, vending machines, and lockers, not just transit. Discounted transfers apply within a set window when you tap the same T-money card across subway and bus, so keep one card per person rather than sharing. A refundable deposit-style card fee applies at purchase, and unused balance under a small cap can be refunded in cash at station customer service before you fly home."
    ]
  },
  {
    topic: 'Tax refund (Tax Free) shopping',
    author: 'Land in Korea Desk',
    url: 'https://www.customs.go.kr',
    content: [
      "Most tourists lose their Tax Free refund before they even reach the airport — not from missing paperwork, but from where they packed the item. Tourists spending over the minimum threshold at Tax Free-affiliated stores can reclaim VAT paid on purchases. Ask for a Tax Free receipt/form at checkout, keep the item unused, and process the refund at airport kiosks (self-service or counter) before checking in your luggage if the item goes in checked baggage. Refund percentage varies by amount spent; check the current threshold and rate before your trip since these are adjusted periodically.",
      "Not every store with 'tax free' prices actually processes tax free — here's the sticker to check for before you buy, not after. Look for the Tax Free/Tax Refund sticker at the entrance or register. Some department stores and duty-free-adjacent malls can process an instant refund at checkout instead of at the airport, saving you the queue later. Keep your passport with you while shopping, since it's required to issue the Tax Free form at the register."
    ]
  },
  {
    topic: 'Travel advisories & safety notices',
    author: 'Land in Korea Desk',
    url: 'https://www.mofa.go.kr',
    content: [
      "Korea's crime stats beat most Western capitals — but that's not the risk that actually catches tourists off guard. Korea is generally very safe for tourists, with low violent crime rates even late at night in major cities. Standard precautions still apply: watch for pickpockets in crowded markets, keep an eye on drinks in nightlife areas, and register with your home country's embassy notification service for real-time alerts during your stay. Check your government's official travel advisory page for Korea shortly before departure, since regional notices can change.",
      "The weather, not the crime rate, is what actually disrupts trips to Korea — and most itineraries build in zero buffer for it. Natural events like typhoons (summer/early fall) or heavy snow (winter) can disrupt trains and flights with little warning — build a buffer day into your itinerary if traveling during those seasons. Save the emergency numbers 112 (police) and 119 (fire/medical) before you land; many operators have English support. Hotels and hostels can usually help translate in a pinch if you're unsure whether a situation needs official help."
    ]
  },
  {
    topic: 'Airport transfer options',
    author: 'Land in Korea Desk',
    url: 'https://www.airport.kr',
    content: [
      "Four ways to get from Incheon to Seoul, and the 'cheapest' one on paper isn't always the best deal once you count your luggage. The AREX airport railway is the cheapest and most predictable option into Seoul, with an express non-stop train to Seoul Station. Airport limousine buses drop closer to specific neighborhoods and hotels if you have heavy luggage. Taxis are metered and reliable but pricier during traffic; deluxe/international taxis at the airport accept card payment and English.",
      "Land in Seoul after midnight, and the transfer option every guide recommends has usually already stopped running. Ride-hailing apps like Kakao T work at both ICN and GMP and often cost less than flagging a taxi curbside, with fares shown upfront in the app. If you're arriving late at night after trains stop running, a licensed airport taxi or a pre-booked private transfer is safer than an unmarked car offering rides in the arrivals hall. Traveling with a large group? A shared van transfer booked in advance can be cheaper per person than several taxis."
    ]
  },
  {
    topic: 'First-timer etiquette & common mistakes',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    content: [
      "Tipping in Korea doesn't just go unused — it can actively confuse the person you hand it to. Other common first-timer mix-ups: escalators have a standing side by local custom (though rules vary by city); many small restaurants are cash-preferred or card-only with no split-bill custom; shoes usually come off indoors at traditional guesthouses and some restaurants with floor seating.",
      "The gesture that reads as rude to older Koreans isn't loud or obvious — it's how you hand someone your card. Passing money/cards with one hand, or pointing with a single finger, can read as slightly rude — using both hands or supporting your arm is a small gesture that's well received. It's common to pour drinks for others rather than yourself at a shared meal, and to wait for the eldest or host to start eating first. Loud phone calls on public transit are frowned upon — most locals keep calls short or step off first."
    ]
  },
  {
    topic: 'Currency & card payments',
    author: 'Land in Korea Desk',
    url: 'https://www.bok.or.kr',
    content: [
      "Korea looks cash-optional right up until you're standing in a market that only takes cash — and by then it's too late to plan for it. Most cafes, convenience stores, and restaurants in cities accept card, including foreign Visa/Mastercard, though small traditional markets and some rural spots may be cash-only. Airport and city-center ATMs marked 'Global' or with a foreign card logo accept international cards; look for Woori, KEB Hana, or 7-Eleven ATMs for the most reliable acceptance. Notify your bank of your travel dates beforehand to avoid a card freeze on first use.",
      "The card payment mistake that quietly costs you extra on every single purchase: picking your home currency instead of won at checkout. Dynamic currency conversion adds a hidden markup, so always choose to be charged in Korean won. Currency exchange counters near Myeongdong and Hongdae typically offer better rates than airport kiosks — exchange only what you need for the first day or two, then top up in the city. Mobile payment apps like Samsung Pay or Naver Pay are widely used locally but usually require a Korean bank account, so cards remain the simplest option for visitors."
    ]
  },
  {
    topic: 'Emergency numbers & 24hr pharmacies',
    author: 'Land in Korea Desk',
    url: 'https://www.1330.or.kr',
    content: [
      "112 and 119 both work in English in Korea — but neither is usually the number first-time travelers actually need. For most non-emergency travel snags, the 1330 Korea Travel Hotline offers 24/7 multilingual help, from lost passports to interpretation during a hospital visit. Save 112 for police and 119 for fire, ambulance, and medical emergencies. Large hospitals in Seoul (like Severance or Samsung Medical Center) have dedicated international clinics with English-speaking staff.",
      "24-hour convenience stores are everywhere in Korea. 24-hour pharmacies are not — and most travelers only find out the hard way. Late-night pharmacies do exist but are far less common — look for a green cross sign, and ask staff or a hotel front desk for the nearest one open after hours. Common over-the-counter medicine names differ from Western brands, so showing the pharmacist a translated symptom list (Papago works well) speeds things up. Travel insurance is worth having, since upfront payment is usually required before any reimbursement process at Korean hospitals."
    ]
  },
  {
    topic: 'Useful travel apps',
    author: 'Land in Korea Desk',
    url: 'https://map.naver.com',
    content: [
      "Google Maps quietly stops being useful the moment you land in Korea — and most first-timers don't find out until they're already lost. Naver Map or KakaoMap work far better for walking/transit directions here, since Google's local data is limited. Papago handles Korean translation, including camera translation for menus and signs, more naturally than most general translation apps. Kakao T is the go-to app for calling taxis reliably, especially late at night.",
      "Two apps do more of the trip-planning work than people expect in Korea — and neither one is the app everyone already has installed. Download Naver Map and Papago before you land, since some functions work better with a local IP or Korean SIM/eSIM active. KakaoMap and Naver Map both show real-time subway/bus arrival times and platform-level transfer directions inside stations, which most visitors don't discover until later in the trip. For restaurant reviews, Naver's map integrates local review data that's often more current than international apps."
    ]
  },
  {
    topic: 'Convenience store hacks',
    author: 'Land in Korea Desk',
    url: 'https://www.cu.bgfretail.com',
    content: [
      "CU, GS25, and 7-Eleven in Korea do a lot more than sell snacks — most tourists use maybe 10% of what's actually available at the counter. They're open 24/7 almost everywhere and double as a mini pharmacy, ATM, and hot-food counter — many have microwaves and hot water for instant noodles or heat-and-eat meals right at the counter or a small seating area. You can pay bills, buy concert/show tickets, or even ship a parcel through some counters. Look for 1+1 or 2+1 stickers for real bundle discounts.",
      "The cheapest breakfast in Korea isn't a restaurant — it's the convenience store counter most tourists walk straight past. Coffee and toast/sandwich combos are a fast, cheap option when nothing else is open early. Many locations sell single-dose medicine (painkillers, cold medicine) since Korean pharmacy hours can be limited, though selection is basic. If you're low on cash, most have an ATM, though a foreign-card withdrawal fee usually applies — check your app instead of assuming it's free."
    ]
  },
  {
    topic: 'Seasonal packing & weather tips',
    author: 'Land in Korea Desk',
    url: 'https://www.weather.go.kr',
    content: [
      "The season that looks easiest to pack for in Korea is usually the one that catches the most travelers off guard. Summers (Jun-Aug) are hot and humid with a distinct monsoon season in July — pack light, breathable clothing and a compact umbrella rather than a heavy raincoat. Winters (Dec-Feb) can be dry and cold with occasional heavy snow, especially outside Seoul, so a proper coat and layering matter more than most visitors expect. Spring and fall are the most comfortable seasons for walking-heavy itineraries, but also the most crowded.",
      "Packing for Korea's weather outside isn't the hard part — it's the indoor heating and AC swings that wreck most people's layering plan. Heating and air conditioning here run strong, so layering helps you adjust between freezing streets and warm subways in winter, or humid streets and cold AC indoors in summer. Comfortable walking shoes matter more than fashion, since Korean cities involve a lot of walking and stairs. If you're visiting during monsoon season, quick-dry fabric beats cotton."
    ]
  },
  {
    topic: 'Luggage storage & forwarding services',
    author: 'Land in Korea Desk',
    url: 'https://www.klook.com/en-US/blog/luggage-storage-korea/',
    content: [
      "Coin lockers at Korean subway stations look like the easy answer — until you actually try to find an empty one on a weekend. They're available at most major stations and can be paid for with T-money, but fill up fast on weekends and holidays. Luggage storage counters near major stations and popular neighborhoods (Myeongdong, Hongdae) can hold bags for a full day at a flat rate. Some hotels will hold luggage even after checkout at no extra charge — always ask before paying for outside storage.",
      "Most travelers drag their bags through their entire last day in Korea without knowing forwarding services exist for exactly that problem. Same-day luggage forwarding can send your bags from your hotel straight to the airport (or another hotel) so you can spend your last day sightseeing hands-free — and avoid dragging bags through crowded transit during rush hour before an early flight. Book at least a day in advance, since same-day requests aren't always guaranteed."
    ]
  }
];

/**
 * Land in Korea 브랜드 주제 시드 콘텐츠를 반환합니다.
 * 실제 배포 환경에서는 이 함수를 실시간 크롤링/RSS 결과로 교체하세요.
 */
const fetchKoreaTravelTopics = async () => {
  log.section('Land in Korea 주제 수집');
  log.ok(`시드 소스 ${SOURCES.length}건 로드 완료`);
  return SOURCES.map((s) => ({
    source: s.topic,
    author: s.author,
    content: s.content,
    url: s.url
  }));
};

module.exports = { fetchKoreaTravelTopics, SOURCES };
