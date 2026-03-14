const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs-extra');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

// 递归混淆JS文件
async function obfuscateFiles(dir) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      await obfuscateFiles(filePath);
    } else if (path.extname(file) === '.js') {
      const code = await fs.readFile(filePath, 'utf8');
      const obfuscated = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        stringArray: true,
        stringArrayEncoding: ['base64'], 
        disableConsoleOutput: true
      });
      const distPath = path.join(distDir, path.relative(srcDir, filePath));
      await fs.ensureDir(path.dirname(distPath));
      await fs.writeFile(distPath, obfuscated.getObfuscatedCode());
    }
  }
}

obfuscateFiles(srcDir).then(() => {
  console.log('代码混淆完成，输出至dist目录');
});