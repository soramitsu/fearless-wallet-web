// Navigation and browser-only helpers for the real extension smoke.
export async function openDappPage(cdp, url, { evaluate, waitForExpression }) {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  // Target.createTarget can expose an already-complete about:blank document
  // before its requested navigation commits. Helpers installed there are lost.
  await waitForExpression(
    cdp,
    sessionId,
    `location.href === ${JSON.stringify(url)} && document.readyState === "complete"`,
    'requested dApp page load'
  );
  await evaluate(
    cdp,
    sessionId,
    `
      function base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

        return bytes;
      }

      function bytesToBase64(bytes) {
        let binary = '';

        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });

        return btoa(binary);
      }

      true;
    `
  );

  return sessionId;
}
