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
const SOURCES = [
  {
    topic: 'Gyeongbokgung Palace',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    category: 'attraction',
    placeKeyword: '경복궁',
    content: [
      "Gyeongbokgung isn't just a palace to photograph — the changing of the royal guard ceremony runs at set times most visitors miss because they show up whenever. It's Seoul's largest palace, built in 1395, with the National Folk Museum inside the same grounds. Wearing a hanbok gets you free entry — one of the few genuinely useful tourist discounts in the city. The palace closes on Tuesdays, which trips up more first-timers than any other detail.",
      "Most people spend 20 minutes at Gyeongbokgung and miss the part that's actually free and worth the wait. The royal guard-changing ceremony happens at scheduled times in the main courtyard — check before you go, since it doesn't run continuously. Bukchon Hanok Village is a short walk away, so the two pair naturally into one afternoon. Renting a hanbok nearby gets you into the palace for free, and it makes for better photos than street clothes."
    ]
  },
  {
    topic: 'Bukchon Hanok Village',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    category: 'attraction',
    placeKeyword: '북촌한옥마을',
    content: [
      "Bukchon Hanok Village is a real residential neighborhood, not a museum — and that's exactly why so many visitors get it wrong. People still live in these traditional hanok houses, so some alleys post 'quiet please' signs after certain hours out of respect for residents. The best photo spots (like the view down the sloped alley near Gahoe-dong) get crowded fast in the morning. It sits between Gyeongbokgung and Changdeokgung, making it an easy add-on to either palace visit.",
      "The hanok houses in Bukchon aren't a recreation — real families live behind those tiled roofs, which changes how you should behave walking through. Keep voices down in residential alleys, especially early morning or evening. The neighborhood connects two major palaces, so most people visit it as a walk between Gyeongbokgung and Changdeokgung rather than a separate trip. Weekday mornings are the quietest time to actually see the alleys without a crowd in every photo."
    ]
  },
  {
    topic: 'N Seoul Tower (Namsan)',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    category: 'attraction',
    placeKeyword: 'N서울타워',
    content: [
      "You don't need the paid observation deck at N Seoul Tower to get a great view of Seoul — the plaza around the tower already sits at the top of Namsan and is free. The cable car up is optional too; a marked hiking trail from Myeongdong reaches the summit in about 30-40 minutes. The 'love locks' fence near the base is real and still growing. Sunset is the busiest time, so early afternoon or right after opening avoids the worst of the crowd.",
      "Most tourists pay for the N Seoul Tower elevator without realizing the hike up Namsan is free, scenic, and takes less time than people assume. From Myeongdong, the marked trail is about 30-40 minutes of walking, mostly stairs and paved path. The tower's paid deck adds height, but the free plaza view is already above most of the city skyline. Go for sunset if you don't mind the crowd, or early morning if you want the view without one."
    ]
  },
  {
    topic: 'Myeongdong shopping district',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    category: 'attraction',
    placeKeyword: '명동',
    content: [
      "Myeongdong's street food stalls mostly open in the late afternoon, so showing up at lunchtime expecting the famous street food scene is the single most common first-timer mistake. It's Seoul's biggest shopping district for cosmetics and fashion, with staff at many stores speaking basic English, Japanese, or Chinese. Tax Free shopping is everywhere here — look for the sticker before you buy. It gets extremely crowded on weekends, so weekday visits are noticeably more walkable.",
      "The Myeongdong everyone posts about — street food carts lining the main strip — doesn't really exist until late afternoon. Come at lunch and you'll mostly find shopping, not the food scene you saw online. It's dense with cosmetics shops (many offering free samples) and Tax Free-eligible stores. Weekends turn the main street into a slow shuffle of foot traffic, so a weekday evening hits the sweet spot of food stalls open and crowds manageable."
    ]
  },
  {
    topic: 'Busan Haeundae Beach & Gamcheon Culture Village',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    category: 'attraction',
    placeKeyword: '해운대',
    content: [
      "Haeundae Beach and Gamcheon Culture Village get grouped into one Busan day trip constantly, but they're on opposite sides of the city — budget real transit time, not a quick hop. Haeundae is Busan's most famous beach, backed by a dense strip of hotels and restaurants, busiest in summer. Gamcheon is a hillside neighborhood of colorful houses turned into a walkable open-air art village, with steep stairs throughout, so comfortable shoes matter more than they look like they would. KTX from Seoul to Busan takes around 2.5-3 hours.",
      "Busan in one day usually means picking between the beach and the art village, not doing both comfortably — Haeundae and Gamcheon Culture Village sit on opposite ends of the city. Haeundae draws the summer beach crowd and a long strip of seafront restaurants. Gamcheon's colorful hillside houses make for the photos everyone's seen, but the neighborhood is almost entirely stairs and slopes. If you're coming from Seoul, KTX gets you there in about 2.5-3 hours, worth booking ahead in summer."
    ]
  },
  {
    topic: 'Jeju Island',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    category: 'attraction',
    placeKeyword: '제주도',
    content: [
      "Jeju Island isn't reachable by train or the KTX network at all — it's a flight or a long ferry, which surprises visitors used to mainland Korea's rail coverage. It's a volcanic island known for Hallasan (South Korea's tallest mountain), black sand beaches, and a noticeably different local dialect. Renting a car is genuinely the practical option here since public transit is thinner than in Seoul or Busan. Weather changes fast on the coast, so a rain layer is worth packing even in summer.",
      "Most first-timers assume Jeju connects by train like the rest of Korea — it doesn't, since it's an island reachable only by plane or ferry from the mainland. Hallasan, South Korea's tallest peak, sits at the island's center and is climbable in a long day trip. A rental car matters more here than almost anywhere else in Korea, since bus routes are sparser and distances between sights are longer than they look on a map. Coastal weather shifts quickly, so don't leave rain gear behind just because it's summer."
    ]
  },
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
  },
  {
    topic: 'KTX vs. SRT vs. intercity bus for long-distance travel',
    author: 'Land in Korea Desk',
    url: 'https://www.letskorail.com',
    content: [
      "For a Seoul-to-Busan-length trip, the real choice isn't just KTX vs. the bus — it's KTX vs. SRT, and most first-timers don't even know SRT exists. Both are high-speed rail on similar routes with comparable speeds, but they depart from different stations in Seoul (KTX mainly from Seoul Station, SRT from Suseo Station), so the right pick often depends on which side of the city you're starting from, not the train itself. Both require booking a specific seat and departure time, unlike a hop-on bus.",
      "Intercity and express buses cost less than high-speed rail and reach smaller towns that trains skip entirely, but take meaningfully longer on the same long-distance routes — worth it when the destination isn't near a KTX/SRT station, or when the schedule matters more than shaving an hour off the trip. For short layovers or tight connections, the extra buffer time a bus needs is easy to underestimate. Booking apps for both rail and bus let you compare exact departure times before choosing, rather than defaulting to whichever option you've heard of."
    ]
  },
  {
    // 2026-09-06 추가 4개 주제. WebSearch로 실제 조사한 뒤 작성 — 각 항목의 사실은
    // Namdaemun은 VisitKorea/여행사 자료, 쓰레기 분리배출은 종량제 안내 자료,
    // DMZ/JSA는 Viator/여행사 예약 페이지, 찜질방은 여행 가이드 다수 출처로 교차
    // 확인한 것만 담았다(CLAUDE.md 사실 근거 원칙 — 지어내지 않음).
    topic: 'Namdaemun Market',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    category: 'attraction',
    placeKeyword: '남대문시장',
    content: [
      "Namdaemun sits a 10-minute walk from Myeongdong, and a lot of itineraries treat the two as one stop — they're not the same kind of shopping at all. Namdaemun has operated on this site since the early 1400s, making it Korea's largest traditional market. Many sections run on a wholesale schedule (some stalls open as late as 10 PM through 5 AM), not tourist hours, and Sundays are noticeably quieter. There's no entrance fee, but bargaining is normal here in a way it isn't at Myeongdong's fixed-price stores, so bring cash.",
      "Tax Free shopping works differently at Namdaemun than at a department store — most first-timers assume the sticker system is universal and find out otherwise mid-purchase. Smaller independent stalls are far less likely to be affiliated with a refund network than bigger Myeongdong stores, so check for the sticker before buying if the refund matters. The market sells far more than souvenirs: clothing, eyewear, kitchenware, imported goods, and food stalls serving hotteok, tteokbokki, and kalguksu with long-running local followings."
    ]
  },
  {
    topic: 'Trash and recycling rules for residents',
    author: 'Land in Korea Desk',
    url: 'https://www.me.go.kr',
    content: [
      "Sorting recyclables isn't what actually trips people up in Korea — it's using the wrong bag. General waste has to go into an official, district-specific bag (종량제 봉투, sold at local convenience stores and supermarkets); bags bought in a different district aren't accepted even if they look identical, since the collection fee is built into that specific bag's price. This catches foreign residents and short-term renters far more than tourists in hotels, since nobody hands you the local bag with your key.",
      "Food waste in Korea is never combined with general trash — it runs through its own system, often an RFID-weighed communal bin or a separate designated bag. The simple test for what counts: if an animal could safely eat it, it's food waste; bones, shellfish shells, eggshells, and onion or garlic skins are common exceptions that go in general waste instead. Recyclables are sorted by material at a shared point near the building entrance, not mixed into one bag, and collection runs on set days rather than daily."
    ]
  },
  {
    topic: 'DMZ and JSA tours',
    author: 'Land in Korea Desk',
    url: 'https://www.viator.com',
    content: [
      "A DMZ tour and a JSA (Joint Security Area/Panmunjom) tour get blurred together in most search results, but they're not the same trip. A standard DMZ tour covers sites like the Third Tunnel and an observatory within the buffer zone; a JSA tour goes further, into the shared area straddling the actual Military Demarcation Line, and needs booking at least a week ahead with passport details submitted in advance for an eligibility check. Whichever tour, a physical passport is required at the checkpoint — a photo or photocopy won't get you through.",
      "JSA's dress code is enforced, not a suggestion: no sleeveless shirts, no shorts, no sandals, and no military-patterned clothing, and operators do turn people away for violating it. Most operators set a minimum age around 12 for JSA, with anyone under 18 needing a guardian, and nationality restrictions apply for security reasons — worth confirming before booking. Both DMZ and JSA tours run exclusively through registered operators; there's no independent or public-transit access to either."
    ]
  },
  {
    topic: 'Jjimjilbang etiquette',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    content: [
      "A Korean jjimjilbang runs two different dress codes in two adjacent zones, and mixing them up is the actual etiquette mistake — not nudity itself. The gender-separated bathing area requires nudity as a hygiene standard, while the co-ed common area (saunas, lounge) requires the uniform t-shirt and shorts provided at check-in. Tattoo policies have loosened a lot at modern locations, though some older or conservative spots still restrict visible ones, so it's worth checking ahead if you have larger tattoos and a specific place in mind.",
      "Entry typically runs ₩10,000-20,000 for access lasting up to 12 hours, which is why jjimjilbangs double as a legitimate budget overnight option after a late flight or early departure. Check-in follows a consistent pattern: pay at the counter, get a locker key (often a wristband), and remove shoes into a separate shoe locker before the main change area — shoes and street clothes never pass that first threshold. Locations in areas like Itaewon that see more foreign visitors often add English signage, though the underlying rules are the same everywhere."
    ]
  }
];

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
