// A popup opened during an extension update can lose its background port. Opening the next popup is what wakes
// an idle MV3 worker; waiting for a worker after closing the failed popup can prevent the retry altogether.
export const popupResponseProbeSource = `(() => {
  const before = window.__replies;
  const answered = () => window.__replies > before;
  return Promise.race([
    window.__send('pri(accounts.subscribe)').then(answered, answered),
    new Promise((done) => setTimeout(() => done(false), 20000))
  ]);
})()`;

export async function openResponsivePopup({ open, diagnose = async () => {}, attempts = 3 }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const popup = await open();
    const answered = await popup.eval(popupResponseProbeSource).catch(() => false);
    if (answered) return popup;
    try {
      await diagnose();
    } finally {
      popup.close();
      await popup.closeTarget();
    }
  }
  throw new Error(`Extension popup did not answer accounts.subscribe after ${attempts} attempts`);
}
