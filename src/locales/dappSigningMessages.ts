// What the signing screen says while the remote kill switch pauses dApp signing for a network family. {family} is a
// proper noun (Polkadot, EVM, Solana or TON) and is not translated. Unlike the other supplemental bundles this one
// carries the Akkadian and Egyptian text too, so every locale shows the sentence in its own script. Registered at
// locale initialization, because a paused request can reach the signing screen on any start.
const en = {
  signingReview: {
    dappSigningPaused: 'Signing for {family} networks is paused.',
  },
};

const ru: typeof en = {
  signingReview: {
    dappSigningPaused: 'Подписание в сетях {family} приостановлено.',
  },
};

const akk: typeof en = {
  signingReview: {
    dappSigningPaused: '𒅗𒈾𒆪𒌝 𒊭 𒊑𒅅𒋛𒅎 {family} 𒀀𒁲𒉌 𒅗𒆷𒀀.',
  },
};

const egy: typeof en = {
  signingReview: {
    dappSigningPaused: '𓇋𓅱 𓂞 𓋴𓈙 𓈖 𓄡𓈖𓅓𓏥 {family} 𓊵𓏏𓊪𓅱 𓂋 𓄿𓏏𓇳 ·',
  },
};

export const dappSigningMessages = { 'en-EN': en, 'ru-RU': ru, 'akk-Xsux-x-old': akk, 'egy-Egyp': egy } as const;
