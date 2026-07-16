import fs from 'fs';
const content = fs.readFileSync('server.ts', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('app.')) {
    console.log((i+1).toString().padStart(4, '0') + ': ' + line.trimStart().substring(0, 120));
  }
});