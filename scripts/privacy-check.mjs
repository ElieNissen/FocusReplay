import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const failures = [];
const forbiddenPaths =
  /(^|\/)(captures|recordings|userdata|data|work|outputs|node_modules|release|dist)(\/|$)|(^|\/)\.env(?:\.|$)|\.(mp3|wav|mp4|webm|jpe?g|sqlite|db|pfx|pem|key)$/i;
const homePath = new RegExp('[A-Z]:' + '[\\\\/]' + 'Users' + '[\\\\/]' + '[^\\\\/\\s]+', 'i');
const tokens = [
  new RegExp('gh' + '[pousr]_[A-Za-z0-9]{30,}'),
  new RegExp('github' + '_pat_[A-Za-z0-9_]{30,}'),
  new RegExp('sk' + '-(?:proj-)?[A-Za-z0-9_-]{24,}'),
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
for (const file of new Set(files)) {
  if (forbiddenPaths.test(file)) {
    failures.push(file + ': private artifact path');
    continue;
  }
  if (/\.(png|ico)$/i.test(file)) {
    if (!/^(build\/icon\.(png|ico)|docs\/images\/[a-z-]+\.png)$/.test(file))
      failures.push(file + ': image not explicitly allowlisted');
    continue;
  }
  const stat = await fs.stat(file);
  if (stat.size > 3 * 1024 * 1024) {
    failures.push(file + ': unexpectedly large public file');
    continue;
  }
  const text = await fs.readFile(file, 'utf8');
  if (homePath.test(text)) failures.push(file + ': absolute home path');
  if (tokens.some((pattern) => pattern.test(text))) failures.push(file + ': possible secret');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `Privacy check passed: ${new Set(files).size} public files; no private captures, media, home paths or recognized secrets. Review screenshots and free text separately before publication.`,
);
