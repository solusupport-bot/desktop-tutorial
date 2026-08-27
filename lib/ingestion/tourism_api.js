const axios = require('axios');

const API_BASE = 'https://apis.data.go.kr/B551011';
const SERVICES = {
  core: {
    keyEnv: 'TOUR_CORE_ATTRACTIONS_API_KEY',
    path: 'LocgoHubTarService1/areaBasedList1'
  },
  related: {
    keyEnv: 'TOUR_RELATED_ATTRACTIONS_API_KEY',
    path: 'TarRlteTarService1/areaBasedList1'
  }
};

const REGIONS = {
  Seoul: { areaCode: '1', lDongRegnCd: '11' },
  Busan: { areaCode: '6', lDongRegnCd: '26' },
  Incheon: { areaCode: '2', lDongRegnCd: '28' }
};

const pickItems = (data) => {
  const body = data?.response?.body || data?.body || data;
  const raw = body?.items?.item || body?.items || [];
  if (Array.isArray(raw)) return raw;
  return raw ? [raw] : [];
};

const errorMessage = (data) => {
  const header = data?.response?.header || data?.header || {};
  return header.resultMsg || data?.response?.resultMsg || data?.message || '';
};

const request = async ({ service, regionName, numOfRows = 20, pageNo = 1 }) => {
  const config = SERVICES[service];
  if (!config) throw new Error(`지원하지 않는 관광 API 서비스: ${service}`);
  const key = process.env[config.keyEnv];
  if (!key) throw new Error(`${config.keyEnv} Secret이 없습니다.`);
  const region = REGIONS[regionName];
  if (!region) throw new Error(`지원하지 않는 샘플 지역: ${regionName}`);

  const params = {
    serviceKey: key,
    numOfRows,
    pageNo,
    MobileOS: 'ETC',
    MobileApp: 'LandInKorea',
    _type: 'json',
    lDongRegnCd: region.lDongRegnCd
  };

  const url = `${API_BASE}/${config.path}`;
  const response = await axios.get(url, { params, timeout: 20000 });
  const message = errorMessage(response.data);
  const header = response.data?.response?.header || response.data?.header || {};
  if (header.resultCode && header.resultCode !== '0000') {
    throw new Error(`${service}/${regionName}: ${message || header.resultCode}`);
  }
  return {
    service,
    region: regionName,
    endpoint: url,
    items: pickItems(response.data),
    raw: response.data
  };
};

const fetchRegionSamples = async (regions = Object.keys(REGIONS)) => {
  const results = { fetchedAt: new Date().toISOString(), regions: {} };
  for (const region of regions) {
    results.regions[region] = {};
    for (const service of ['core', 'related']) {
      try {
        const result = await request({ service, regionName: region });
        results.regions[region][service] = {
          endpoint: result.endpoint,
          count: result.items.length,
          items: result.items
        };
      } catch (error) {
        results.regions[region][service] = { error: error.message, count: 0, items: [] };
      }
    }
  }
  return results;
};

module.exports = { fetchRegionSamples, request, REGIONS };
