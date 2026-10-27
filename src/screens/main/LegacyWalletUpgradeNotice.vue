<template>
  <div
    v-if="recoveryOnly"
    class="wallet-recovery-banner"
    :lang="noticeLocale === 'ru-RU' ? 'ru' : 'en'"
    role="status"
    data-testid="walletRecoveryBanner"
  >
    <Icon icon="info-triangle" width="16px" height="16px" :hover="false" className="wallet-recovery-banner__icon" />
    <span class="wallet-recovery-banner__text">{{ t('walletBanner') }}</span>
    <button type="button" class="wallet-recovery-banner__action" data-testid="walletRecoveryGuide" @click="openGuide">
      {{ t('walletBannerAction') }}
    </button>
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
import Icon from '@/components/Icon.vue';
import { IS_EXTENSION } from '@/consts/global';
import { WalletEcosystem } from '@/interfaces';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import {
  getLegacyWalletUpgradeAccounts,
  readClosedLegacyWalletNotices,
  rememberClosedLegacyWalletNotices,
} from '@/util/legacyWalletUpgradeNotice';
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
// Closing the dialog is remembered for each wallet on this device, so it opens
// once per old or imported wallet rather than every time the extension opens.
// It never upgrades a wallet, and the recovery banner stays on its pages.
const reviewed = ref<string[]>(readClosedLegacyWalletNotices());
const candidates = computed(() => getLegacyWalletUpgradeAccounts(accountsStore.accounts));
// Only the wallet being viewed decides whether to warn: a newly created wallet
// shows neither the banner nor the dialog, even while older wallets remain.
const recoveryOnly = computed(() => IS_EXTENSION &&
  isSelectedWalletRecoveryOnly(accountsStore.accounts, accountsStore.selectedWallet.address));
// Wallet redirects to Currencies; only portfolio roots may interrupt browsing.
const portfolioRoutes = new Set<string>([Components.Wallet, Components.Currencies, Components.Nfts]);
const visible = computed(() => recoveryOnly.value && active.value && portfolioRoutes.has(String(route.name)) &&
  candidates.value.some(({ address }) => !reviewed.value.includes(address)));

// Switching accounts does not itself navigate. Leave any normal-use screen
// immediately when its selected signer becomes a recovery-only wallet.
watch([recoveryOnly, () => route.name, active], ([restricted, name, isActive]) => {
  if (restricted && isActive && !isWalletRecoveryRoute(name)) {
    void router.replace({ name: Components.Wallet, query: { security: 'recovery-only' } });
  }
}, { immediate: true });

onActivated(() => { active.value = true; });
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
  rememberClosedLegacyWalletNotices(reviewed.value);
};

const dismiss = () => {
  resetNavigation();
  acknowledge(candidates.value.map(({ address }) => address));
};

// The banner's one action is the guide, where the funds are moved step by step (it links the full notice).
const openGuide = () => {
  void router.push({ name: Components.SecurityNoticeGuide });
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
// The one warning an old wallet's pages carry (the exposure reminder stays away while it shows, see Main.vue):
// a single line at the width of the cards below it, so the portfolio keeps its room.
.wallet-recovery-banner {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  margin: 0 0 8px;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--fw-divider);
  border-left: 3px solid var(--fw-warning);
  border-radius: $default-border-radius;
  background: var(--fw-raised);
  color: var(--fw-text-1);
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: left;

  &:lang(ru) { font-family: system-ui, sans-serif; }
}

.wallet-recovery-banner__icon {
  flex: none;
  color: var(--fw-warning);
}

.wallet-recovery-banner__text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.wallet-recovery-banner__action {
  flex: none;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--fw-link);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}
</style>
