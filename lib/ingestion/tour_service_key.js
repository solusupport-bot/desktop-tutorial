/**
 * data.go.kr의 일반 인증키는 포털에 Encoding(퍼센트 인코딩) 형태로 표시된다.
 * 이 값을 그대로 axios params에 넣으면 axios가 다시 인코딩해 이중 인코딩이 되어
 * "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"가 난다 — 그래서 사용 전 한 번 decode한다.
 * 이미 Decoding(원문) 값이 들어있으면(%가 없으면) 그대로 통과시킨다.
 */
const normalizeServiceKey = (value) => {
  const key = String(value || '').trim();
  if (!key) return key;
  try {
    return key.includes('%') ? decodeURIComponent(key) : key;
  } catch {
    return key;
  }
};

module.exports = { normalizeServiceKey };
