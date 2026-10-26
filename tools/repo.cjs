#!/usr/bin/env node
// Usage: node tools/repo.cjs <ipkFile> <outDir> <upstreamSha>
// Writes the Homebrew Channel manifest + repository index (apps.json).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [ipk, out, sha] = process.argv.slice(2);
const REPO = 'ahmad-ksa/youtube-lg';
const RAW = `https://raw.githubusercontent.com/${REPO}/repo`;
const m = path.basename(ipk).match(/^(.+)_(\d+\.\d+\.\d+)_all\.ipk$/);
if (!m) throw new Error('bad ipk name ' + ipk);
const [, id, version] = m;

fs.mkdirSync(out, { recursive: true });
const ipkName = path.basename(ipk);
fs.copyFileSync(ipk, path.join(out, ipkName));

const manifest = {
  id,
  version,
  type: 'web',
  title: 'YouTube LG',
  appDescription: 'YouTube بدون إعلانات + SponsorBlock',
  iconUri: `${RAW}/icon.png`,
  sourceUrl: `https://github.com/${REPO}`,
  rootRequired: false,
  ipkUrl: `https://github.com/${REPO}/releases/download/v${version}/${ipkName}`,
  ipkHash: { sha256: crypto.createHash('sha256').update(fs.readFileSync(ipk)).digest('hex') },
  upstream: sha
};
fs.writeFileSync(path.join(out, `${id}.manifest.json`), JSON.stringify(manifest, null, 2));

const index = {
  paging: { page: 1, count: 1, maxPage: 1, itemsTotal: 1 },
  packages: [
    {
      id,
      title: manifest.title,
      iconUri: manifest.iconUri,
      manifestUrl: `${RAW}/${id}.manifest.json`,
      manifest,
      category: 'multimedia',
      shortDescription: manifest.appDescription,
      version
    }
  ]
};
fs.writeFileSync(path.join(out, 'apps.json'), JSON.stringify(index, null, 2));
console.log('wrote', out, version);
