import fs from 'fs';
import path from 'path';

const src = fs.readFileSync('server.ts', 'utf-8');
const lines = src.split('\n');

const apps: { line: number; text: string }[] = [];
lines.forEach((line, i) => {
  if (line.match(/app\.\w+\s*\(/)) {
    apps.push({ line: i, text: line.trimStart() });
  }
});

// extract blocks by parenthesis balance
function extractBlock(startLine: number): string[] {
  const block: string[] = [];
  let parens = 0;
  let inString: string | false = false;
  let escape = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    block.push(line);
    for (let ch of line) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (inString) {
        if (ch === inString) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '(') parens++;
      if (ch === ')') parens--;
    }
    if (parens === 0 && i > startLine) break;
  }
  return block;
}

// define domains and associated line numbers (0-indexed)
const domains: { name: string; start: number; end?: number }[] = [
  { name: 'Health', start: 963, end: 964 }, // health before backup
  { name: 'Config', start: 5126, end: 5127 }, // config near bottom
  { name: 'Backup', start: 1015, end: 1016 },
  { name: 'Auth', start: 1096, end: 1097 },
  { name: 'Auth_Login', start: 1143, end: 1144 },
  { name: 'Auth_Guest', start: 1222, end: 1223 },
  { name: 'Auth_Me', start: 1299, end: 1300 },
  { name: 'Auth_Personalities', start: 1360, end: 1361 },
  { name: 'Auth_Profile', start: 1421, end: 1422 },
  { name: 'Auth_ChangePassword', start: 1453, end: 1454 },
  { name: 'Email', start: 1490, end: 1491 },
  { name: 'Auth_Forgot', start: 1520, end: 1521 },
  { name: 'Auth_Reset', start: 1547, end: 1548 },
  { name: 'Auth_ResetPost', start: 1564, end: 1565 },
  { name: 'Auth_2FA', start: 1590, end: 1591 },
  { name: 'Auth_2FA_Setup', start: 1601, end: 1602 },
  { name: 'Auth_2FA_Verify', start: 1620, end: 1621 },
  { name: 'Auth_2FA_Disable', start: 1641, end: 1642 },
  { name: 'Auth_2FA_Validate', start: 1662, end: 1663 },
  { name: 'Plan', start: 1708, end: 1709 },
  { name: 'Plan_Post', start: 1723, end: 1724 },
  { name: 'Plan_Trail', start: 1797, end: 1798 },
  { name: 'Plan_Complete', start: 1845, end: 1846 },
  { name: 'Chat', start: 2013, end: 2014 },
  { name: 'Chat_Sessions', start: 2045, end: 2046 },
  { name: 'Chat_Delete', start: 2085, end: 2086 },
  { name: 'Chat_Update', start: 2106, end: 2107 },
  { name: 'Chat_Create', start: 2131, end: 2132 },
  { name: 'AIDecision', start: 2159, end: 2160 },
  { name: 'AIDecision_Post', start: 2176, end: 2177 },
  { name: 'Model', start: 2204, end: 2205 },
  { name: 'Calendar', start: 2276, end: 2277 },
  { name: 'Calendar_Post', start: 2301, end: 2302 },
  { name: 'Docs', start: 2333, end: 2334 },
  { name: 'Docs_Report', start: 2375, end: 2376 },
  { name: 'Presentation', start: 2494, end: 2495 },
  { name: 'Sheets', start: 2631, end: 2632 },
  { name: 'Google_Callback', start: 2674, end: 2675 },
  { name: 'Google_Auth', start: 2838, end: 2839 },
  { name: 'OAuth2Callback', start: 2900, end: 2901 },
  { name: 'GenerateSteps', start: 3110, end: 3111 },
  { name: 'AnalyzeTask', start: 3228, end: 3229 },
  { name: 'GenerateSubtasks', start: 3288, end: 3289 },
  { name: 'AudioJournal', start: 3362, end: 3363 },
  { name: 'GeneratePlan', start: 3427, end: 3428 },
  { name: 'Chat_AI', start: 3611, end: 3612 },
  { name: 'Pipeline', start: 3763, end: 3764 },
  { name: 'Focus', start: 4060, end: 4061 },
  { name: 'Focus_Stats', start: 4208, end: 4209 },
  { name: 'Focus_Heatmap', start: 4308, end: 4309 },
  { name: 'Focus_Get', start: 4350, end: 4351 },
  { name: 'Sounds_Status', start: 4435, end: 4436 },
  { name: 'Sounds_Binaural', start: 4456, end: 4457 },
  { name: 'Pricing', start: 4554, end: 4555 },
  { name: 'Admin_Pricing', start: 4564, end: 4565 },
  { name: 'Admin_Pricing_Update', start: 4575, end: 4576 },
  { name: 'Admin_Pricing_Create', start: 4613, end: 4614 },
  { name: 'Admin_Pricing_Delete', start: 4656, end: 4657 },
  { name: 'Admin_Subscriptions', start: 4667, end: 4668 },
  { name: 'Admin_MakeAdmin', start: 4692, end: 4693 },
  { name: 'Admin_Expire', start: 4708, end: 4709 },
  { name: 'Subscription_Order', start: 4733, end: 4734 },
  { name: 'Subscription_Link', start: 4835, end: 4836 },
  { name: 'Subscription_Verify', start: 4922, end: 4923 },
  { name: 'Subscription_Cancel', start: 5031, end: 5032 },
  { name: 'Subscription_Status', start: 5080, end: 5081 },
  { name: 'Webhook', start: 5136, end: 5137 },
];

// group line starts by domain name stem
const groups: Record<string, number[]> = {};
for (const d of domains) {
  const stem = d.name.split('_')[0];
  if (!groups[stem]) groups[stem] = [];
  groups[stem].push(d.start);
}

for (const [stem, starts] of Object.entries(groups)) {
  const outPath = path.join('server', 'extracted', `${stem.toLowerCase()}.ts`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const outLines: string[] = [];
  for (const s of starts.sort((a, b) => a - b)) {
    const block = extractBlock(s);
    outLines.push(...block, '');
  }
  fs.writeFileSync(outPath, outLines.join('\n'));
  console.log(`Wrote ${outPath} (${starts.length} blocks)`);
}

console.log('Done extracting.');
