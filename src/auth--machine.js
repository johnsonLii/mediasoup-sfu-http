const jwt = require('jsonwebtoken');
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

// 修改 bindTokenWithUUID 函数，接收前端传递的uuid参数
async function bindTokenWithUUID(token, uuid) {
    await initDb();
    const tokensDb = await fs.readJson(TOKENS_DB_PATH);
    
    // 使用前端传递的UUID而非服务端生成
    tokensDb[token] = {
      uuid: uuid,
      bindTime: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    
    await fs.writeJson(TOKENS_DB_PATH, tokensDb);
    return uuid;
  }
  
  // 修改 checkTokenExists 函数，接收前端传递的uuid参数
  async function checkTokenExists(token, uuid) {
    await initDb();
    const tokensDb = await fs.readJson(TOKENS_DB_PATH);
    const tokenInfo = tokensDb[token];
    
    // 如果token不存在，直接返回false
    if (!tokenInfo) {
      return false;
    }
    
    // 检查token绑定的UUID与前端传递的UUID是否一致
    const isMatch = tokenInfo.uuid === uuid;
    
    if (!isMatch) {
      console.warn(`Token绑定的机器码不匹配，当前机器: ${uuid}, 绑定机器: ${tokenInfo.uuid}`);
    }
    
    // 如果匹配，更新最后活跃时间
    if (isMatch) {
      tokenInfo.lastActive = new Date().toISOString();
      await fs.writeJson(TOKENS_DB_PATH, tokensDb);
    }
    
    return isMatch;
  }

module.exports = {
  verifyToken,
  bindTokenWithUUID,
  checkTokenExists
};