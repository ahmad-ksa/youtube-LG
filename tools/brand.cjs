#!/usr/bin/env node
// Usage: node tools/brand.cjs <upstreamDir> <buildNumber>
// Re-brands the upstream youtube-webos checkout and sets a monotonically increasing version.
const fs = require('fs');
const path = require('path');

const [dir, build] = process.argv.slice(2);
if (!dir || !build) throw new Error('Usage: brand.cjs <upstreamDir> <buildNumber>');

const pkgFile = path.join(dir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const [maj, min, pat] = pkg.version.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
pkg.version = `${maj}.${min}.${pat * 1000 + Number(build)}`;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

const appFile = path.join(dir, 'assets', 'appinfo.json');
const app = JSON.parse(fs.readFileSync(appFile, 'utf8'));
app.title = 'YouTube LG';
app.vendor = 'ahmad-ksa';
fs.writeFileSync(appFile, JSON.stringify(app, null, 2) + '\n');

console.log(`version=${pkg.version}`);
