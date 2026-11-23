// 2026-11-24: 발행기들이 실패 시 null만 돌려줘서, "글 자체가 잘못된" 오류(Meta code=100 파라미터 오류 —
// 예: 500자 초과)와 일시적 오류(네트워크·한도)를 run.js가 구분하지 못했다. 그 결과 잘못된 글 하나가
// 재시도마다 실패를 쌓아 api_safety 연속 오류 보호가 스레드 발행 전체를 막았다(11/21~11/24 스레드 0건).
// 발행기는 마지막 오류를 여기 남기고, run.js는 콘텐츠 오류면 그 글만 재시도 없이 실패 처리하고
// 플랫폼 전체 연속 오류 카운트에는 넣지 않는다.
const last = {};

const setLastError = (platform, err) => {
  const apiError = err && err.response && err.response.data && err.response.data.error;
  last[platform] = {
    message: apiError ? apiError.message : (err && err.message) || String(err),
    code: apiError ? apiError.code : undefined,
    // Meta Graph/Threads code 100 = Invalid parameter → 같은 글로 다시 보내도 계속 실패한다.
    contentError: Boolean(apiError && apiError.code === 100)
  };
};

const takeLastError = (platform) => {
  const value = last[platform] || null;
  delete last[platform];
  return value;
};

module.exports = { setLastError, takeLastError };
