const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BASE_URL = process.env.OLLAYA_BASE_URL || 'http://127.0.0.1:11435';
const MODEL = process.env.OLLAYA_QUALITY_MODEL || 'laya:multilingual';
const MIN_CONFIDENCE = Number(process.env.OLLAYA_QUALITY_MIN_CONFIDENCE || 0.55);
const DEFAULT_ROOT = path.join(os.homedir(), 'Documents', 'Codex', 'tools', 'Ollaya');
const EXE = process.env.OLLAYA_EXE || path.join(DEFAULT_ROOT, '0.7.4', 'bin', 'ollaya.exe');
const MODELS = process.env.OLLAYA_MODELS || path.join(DEFAULT_ROOT, 'models');
const LOGS = process.env.OLLAYA_LOG_DIR || path.join(DEFAULT_ROOT, 'logs');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const isReady = async () => {
  try {
    const response = await request(`${BASE_URL}/api/version`, {}, 1500);
    return response.ok;
  } catch (_) {
    return false;
  }
};

const ensureServer = async () => {
  if (await isReady()) return true;
  if (!fs.existsSync(EXE)) return false;

  fs.mkdirSync(MODELS, { recursive: true });
  fs.mkdirSync(LOGS, { recursive: true });
  const child = spawn(EXE, ['serve'], {
    cwd: DEFAULT_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      OLLAYA_HOST: '127.0.0.1:11435',
      OLLAYA_MODELS: MODELS,
      OLLAYA_LOG_DIR: LOGS
    }
  });
  child.unref();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(400);
    if (await isReady()) return true;
  }
  return false;
};

/**
 * 로컬 의사결정 모델로 캡션을 먼저 검사한다. 확신이 낮은 결과는 decisive:false로
 * 돌려 보내 상위 품질 게이트가 Groq 또는 사람 검수로 넘길 수 있게 한다.
 */
const runOllayaQualityGate = async (topic, captionSample) => {
  if (!topic || !captionSample || !(await ensureServer())) return null;

  const body = {
    model: MODEL,
    state: `요청 주제: ${topic}\nSNS 캡션: ${captionSample}`,
    questions: {
      publish_ready: {
        type: 'choice',
        instructions: '다음 SNS 캡션을 그대로 게시해도 되는지 판단하세요.',
        criteria: {
          pass: '요청한 한국 여행 주제와 직접 관련 있고, 자연스럽고 완성된 유용한 글이며 의심스럽거나 과장된 사실 주장이 없다.',
          fail: '주제와 무관하거나, 글이 깨졌거나 반복적이거나, 여행 정보로 유용하지 않거나, 의심스럽고 과장된 주장을 한다.'
        }
      }
    },
    keep_alive: '5m'
  };

  const response = await request(`${BASE_URL}/api/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  }, 120000);

  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `Ollaya 호출 실패: ${response.status}`);

  const answer = json.answers?.publish_ready;
  if (!answer || !['pass', 'fail'].includes(answer.choice)) {
    throw new Error('Ollaya 응답에 품질 판정이 없습니다.');
  }

  const confidence = Number(answer.confidence || 0);
  return {
    pass: answer.choice === 'pass',
    decisive: confidence >= MIN_CONFIDENCE,
    confidence,
    probabilities: answer.probabilities || {},
    model: json.model || MODEL
  };
};

module.exports = { runOllayaQualityGate };
