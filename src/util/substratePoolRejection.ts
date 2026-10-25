// Explicit author RPC refusals. "Already imported" (1013), unclassified errors
// and transport failures do not prove the transaction was rejected.
const DEFINITE_POOL_REJECTIONS = new Set([1001, 1002, 1010, 1011, 1012, 1014, 1015, 1016, 1018, 1019, 1020, 1021]);

export function isDefiniteSubstratePoolRejection(error: unknown): boolean {
  try {
    // RpcError.code is nonenumerable. Preserve its precedence over message text.
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    if (typeof code === 'number') return DEFINITE_POOL_REJECTIONS.has(code);

    const match = /^(-?\d+):/.exec(error instanceof Error ? error.message : String(error));
    return match !== null && DEFINITE_POOL_REJECTIONS.has(Number(match[1]));
  } catch {
    return false;
  }
}
