import fs from 'node:fs';

const requiredContent = [
  ['src/pages/index.vue', ['Universal Wallet', 'Bitcoin', 'Solana', 'TON', 'SORA Nexus', 'Taira']],
  ['src/pages/download.vue', ['self-custody', 'browser extension', 'iOS', 'Android', 'GitHub']],
  ['src/pages/roadmap.vue', ['Universal Wallet', 'Bitcoin', 'Solana', 'Taira', 'SORA Nexus']],
  ['src/lib/networks.ts', ['bitcoin:', 'solana:', 'nexus:', 'taira:', 'si.soramitsu.io']],
  ['src/components/Network/networks.ts', ["slug: 'bitcoin'", "slug: 'solana'", "slug: 'nexus'", "slug: 'taira'"]],
];

let failed = false;

for (const [file, needles] of requiredContent) {
  const content = fs.readFileSync(file, 'utf8');

  for (const needle of needles) {
    if (!content.includes(needle)) {
      console.error(`${file} is missing required release content: ${needle}`);
      failed = true;
    }
  }
}

for (const file of ['src/public/networks/bitcoin.svg', 'src/public/networks/solana.svg']) {
  if (!fs.existsSync(file)) {
    console.error(`${file} is missing`);
    failed = true;
  }
}

if (failed) process.exit(1);

console.log('Release content verification passed.');
