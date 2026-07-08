import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../');
const cfgFile = path.join(projectRoot, 'config.json');

const defaults = {
  webhook: '',
  pushTime: '06:30',
  userName: '',
  birthDate: '',
  birthTime: '',
  gender: 'male',
  location: ''
};

function envConfig() {
  return {
    webhook: process.env.DINGTALK_WEBHOOK || process.env.WEBHOOK || '',
    pushTime: process.env.PUSH_TIME || '',
    userName: process.env.USER_NAME || '',
    birthDate: process.env.BIRTH_DATE || '',
    birthTime: process.env.BIRTH_TIME || '',
    gender: process.env.GENDER || '',
    location: process.env.BIRTH_LOCATION || process.env.LOCATION || ''
  };
}

function dropEmptyValues(config) {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== ''));
}

function stripBOM(str) {
  if (str.charCodeAt(0) === 0xFEFF) return str.slice(1);
  return str;
}

export function loadConfig() {
  const fromEnv = dropEmptyValues(envConfig());
  try {
    if (fs.existsSync(cfgFile)) {
      let raw = fs.readFileSync(cfgFile, 'utf8');
      raw = stripBOM(raw);
      const fromFile = JSON.parse(raw);
      return {
        ...defaults,
        ...fromEnv,
        ...fromFile,
        webhook: fromFile.webhook || fromEnv.webhook || defaults.webhook
      };
    }
  } catch (e) {
    console.warn('读取配置失败:', e.message);
  }
  return { ...defaults, ...fromEnv };
}

export function saveConfig(data) {
  const existing = loadConfig();
  const merged = { ...existing, ...data };
  const utf8NoBom = new TextEncoder().encode(JSON.stringify(merged, null, 2));
  fs.writeFileSync(cfgFile, utf8NoBom);
  console.log('配置已保存到:', cfgFile);
}
