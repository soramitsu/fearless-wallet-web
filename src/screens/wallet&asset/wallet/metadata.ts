import type { ComputedRef, InjectionKey } from 'vue';
import type { WalletMetadataIndex } from '@/helpers/currencies';

export const WalletMetadataKey: InjectionKey<ComputedRef<WalletMetadataIndex>> = Symbol('WalletMetadataKey');
