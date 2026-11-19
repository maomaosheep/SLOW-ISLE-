const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const assets = {
  'hero.jpg': 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1200&q=85',
  'latte.jpg': 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=700&q=85',
  'americano.jpg': 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&w=700&q=85',
  'croissant.jpg': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=85',
};
function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode}`)); return; }
      const parts = []; response.on('data', chunk => parts.push(chunk));
      response.on('end', () => resolve(Buffer.concat(parts))); response.on('error', reject);
    }).on('error', reject);
  });
}
(async () => {
  const dir = path.resolve(__dirname, '../miniprogram/assets');
  await fs.mkdir(dir, {recursive: true});
  const results = await Promise.allSettled(Object.entries(assets).map(async ([name, url]) => {
    const data = await download(url); await fs.writeFile(path.join(dir, name), data);
    console.log(`${name}: ${data.length} bytes`);
  }));
  for (const result of results) if (result.status === 'rejected') { console.error(result.reason); process.exitCode = 1; }
})();
