import { onScopeDispose, reactive, watch, type Ref } from 'vue';
import type { CheckNftResponse, NftTx } from '@extension-base/services/nft-service/types';

export function useNftFeeQuote(tx: Readonly<Ref<NftTx>>, check: (tx: NftTx) => Promise<CheckNftResponse>) {
  const quote = reactive({ fee: '', pending: false, error: undefined as CheckNftResponse['error'] });
  let revision = 0;
  watch(tx, async (value) => {
    const request = ++revision;
    quote.fee = '';
    quote.error = undefined;
    quote.pending = true;
    try {
      const result = await check({ ...value });
      if (revision !== request) return;
      if (!result.error && (!result.fee || !Number.isFinite(Number(result.fee)) || Number(result.fee) < 0))
        throw new Error('Invalid fee quote');
      quote.fee = result.fee;
      quote.error = result.error;
    } catch {
      if (revision === request) quote.error = 'estimationFailed';
    } finally {
      if (revision === request) quote.pending = false;
    }
  }, { immediate: true, deep: true, flush: 'sync' });
  onScopeDispose(() => { revision += 1; });
  return quote;
}
