const jwt = require('jsonwebtoken');
const { machineIdSync } = require('node-machine-id');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');

// 存储路径与公钥路径
const TOKENS_DB_PATH = path.join(__dirname, '../db/tokens.json');
const PUBLIC_KEY_PATH = path.join(__dirname, '../keys/public.key');

// 初始化数据库
async function initDb() {
  await fs.ensureDir(path.dirname(TOKENS_DB_PATH));
  if (!await fs.pathExists(TOKENS_DB_PATH)) {
    await fs.writeJson(TOKENS_DB_PATH, {});
  }
}

// 验证token签名
async function verifyToken(token) {
  try {
    const publicKey = await fs.readFile(PUBLIC_KEY_PATH, 'utf8');
    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'] // 匹配生成token时的算法
    });
  } catch (err) {
    console.error('Token验证失败:', err.message);
    return null;
  }
}

// 绑定token与机器UUID
async function bindTokenWithUUID(token) {
  await initDb();
  const tokensDb = await fs.readJson(TOKENS_DB_PATH);
  
  // 生成基于硬件的唯一标识
  const machineUUID = machineIdSync({ original: true });
  
  // 若token已存在则更新，否则新增
  tokensDb[token] = {
    uuid: machineUUID,
    bindTime: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };
  
  await fs.writeJson(TOKENS_DB_PATH, tokensDb);
  return machineUUID;
}

// 检查token是否已绑定
async function checkTokenExists(token) {
  await initDb();
  const tokensDb = await fs.readJson(TOKENS_DB_PATH);
  return !!tokensDb[token];
}

module.exports = {
  verifyToken,
  bindTokenWithUUID,
  checkTokenExists
};