<template>
  <div v-if="IS_EXTENSION && candidates.length" class="wallet-recovery-banner" :lang="noticeLocale === 'ru-RU' ? 'ru' : 'en'" role="status">
    <span>{{ t('banner') }}</span>
    <button type="button" @click="reviewNotice">{{ t('review') }}</button>
  </div>
  <LegacyWalletUpgradePopup
    v-if="visible"
    :opening="opening"
    :navigationError="navigationError"
    @dismiss="dismiss"
    @create="createWallet"
  />
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import LegacyWalletUpgradePopup from './LegacyWalletUpgradePopup.vue';
import { IS_EXTENSION } from '@/consts/global';
import { WalletEcosystem } from '@/interfaces';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import { getLegacyWalletUpgradeAccounts } from '@/util/legacyWalletUpgradeNotice';
import { legacyWalletUpgradeMessages } from '@/locales/legacyWalletUpgrade';
import { isSelectedWalletRecoveryOnly, isWalletRecoveryRoute } from '@/util/walletRecoveryPolicy';

const { locale: appLocale } = useI18n({ useScope: 'global' });
const { t, locale: noticeLocale } = useI18n({
  useScope: 'local', inheritLocale: false,
  locale: appLocale.value === 'ru-RU' ? 'ru-RU' : 'en-EN', messages: legacyWalletUpgradeMessages,
});
watch(appLocale, (locale) => { noticeLocale.value = locale === 'ru-RU' ? 'ru-RU' : 'en-EN'; });

const accountsStore = useAccountsStore();
const route = useRoute();
const router = useRouter();
const active = ref(true);
const opening = ref(false);
const navigationError = ref(false);
let navigationAttempt = 0;
// Reviewing the notice only enters recovery mode for this visit. It never
// upgrades a wallet, and it cannot permanently suppress a security warning.
const reviewed = ref<string[]>([]);
const candidates = computed(() => getLegacyWalletUpgradeAccounts(accountsStore.accounts));
// Wallet redirects to Currencies; only portfolio roots may interrupt browsing.
const portfolioRoutes = new Set<string>([Components.Wallet, Components.Currencies, Components.Nfts]);
const visible = computed(() => IS_EXTENSION && active.value && portfolioRoutes.has(String(route.name)) &&
  candidates.value.some(({ address }) => !reviewed.value.includes(address)));

// Switching accounts does not itself navigate. Leave any normal-use screen
// immediately when its selected signer becomes a recovery-only wallet.
const recoveryOnly = computed(() => IS_EXTENSION &&
  isSelectedWalletRecoveryOnly(accountsStore.accounts, accountsStore.selectedWallet.address));
watch([recoveryOnly, () => route.name, active], ([restricted, name, isActive]) => {
  if (restricted && isActive && !isWalletRecoveryRoute(name)) {
    void router.replace({ name: Components.Wallet, query: { security: 'recovery-only' } });
  }
}, { immediate: true });

onActivated(() => { reviewed.value = []; active.value = true; });
onDeactivated(() => { active.value = false; });

const resetNavigation = () => {
  navigationAttempt += 1;
  opening.value = false;
  navigationError.value = false;
};
// A response from an earlier visit must not change a newly opened notice.
watch([visible, () => route.name], resetNavigation, { flush: 'sync' });
onBeforeUnmount(resetNavigation);

const acknowledge = (addresses: string[]) => {
  reviewed.value = [...new Set([...reviewed.value, ...addresses])];
};

const dismiss = () => {
  resetNavigation();
  acknowledge(candidates.value.map(({ address }) => address));
};

const reviewNotice = () => {
  reviewed.value = [];
  void router.push({ name: Components.Wallet });
};

const createWallet = async () => {
  if (opening.value || !visible.value) return;
  const attempt = ++navigationAttempt;
  const addresses = candidates.value.map(({ address }) => address);
  opening.value = true;
  navigationError.value = false;
  try {
    const failure = await router.push({
      name: Components.AddWallet,
      params: { type: 'create', walletEcosystem: WalletEcosystem.Substrate },
    });
    if (!failure) acknowledge(addresses);
  } catch {
    if (attempt === navigationAttempt && visible.value) navigationError.value = true;
  } finally {
    if (attempt === navigationAttempt) opening.value = false;
  }
};
</script>

<style lang="scss" scoped>
.wallet-recovery-banner {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 0;
  padding: 10px 12px;
  border-left: 3px solid $pink-color;
  background: #ee007710;
  color: #ffb9dc;
  font-size: 11px;
  line-height: 1.4;
  text-align: left;

  &:lang(ru) { font-family: system-ui, sans-serif; }

  button {
    border: 0;
    padding: 6px 0;
    background: transparent;
    color: white;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
}
</style>
