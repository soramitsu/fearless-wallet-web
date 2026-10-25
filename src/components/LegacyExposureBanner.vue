<template>
  <div v-if="visible" class="legacy-exposure-banner" role="status" data-testid="legacyExposureBanner">
    <span class="legacy-exposure-banner__text">{{ reminderText }}</span>

    <button type="button" class="legacy-exposure-banner__action" data-testid="legacyExposureBannerOpen" @click="open">
      {{ t('exposureNotice.openGuide') }}
    </button>

    <button
      type="button"
      class="legacy-exposure-banner__dismiss"
      :aria-label="t('common.close')"
      data-testid="legacyExposureBannerDismiss"
      @click="close"
    >
      <Icon icon="close" width="16px" height="16px" aria-hidden="true" />
    </button>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LegacyExposureStatus } from '@extension-base/services/legacy-exposure-service';
import { getLegacyExposureStatus } from '@/extension/messaging/legacy-exposure';
import { useI18n } from '@/locales/useI18n';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import {
  readClosedReminders,
  rememberClosedReminders,
  sameWalletAddress,
  walletsStillToMove,
} from '@/util/legacyExposure';

const route = useRoute();
const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();

// Remind only on the selected old or imported wallet. Closing is remembered per wallet.
const status = ref<LegacyExposureStatus>();
let refreshRevision = 0;
const closed = ref(readClosedReminders());
const stillToMove = computed(() => walletsStillToMove(status.value));
const count = computed(() => status.value?.wallets.filter(({ present, movedAt }) => present && !movedAt).length ?? 0);
const selected = computed(() =>
  stillToMove.value.find(({ address }) => sameWalletAddress(address, accountsStore.selectedWallet.address))
);
const reminderText = computed(() =>
  status.value?.importedWallets?.some(({ address }) => sameWalletAddress(address, selected.value?.address ?? ''))
    ? t('exposureNotice.importedReminder')
    : tc('exposureNotice.reminder', count.value, { count: count.value })
);
const visible = computed(() => {
  const wallet = selected.value;

  return !!wallet && !closed.value.some((address) => sameWalletAddress(address, wallet.address));
});

function close(): void {
  if (!selected.value) return;

  // Without storage it stays closed until the wallet window closes.
  closed.value = rememberClosedReminders([...closed.value, selected.value.address]);
}

async function refresh(): Promise<void> {
  const revision = ++refreshRevision;
  closed.value = [...new Set([...closed.value, ...readClosedReminders()])];

  try {
    const next = await getLegacyExposureStatus();
    if (revision === refreshRevision) status.value = next;
  } catch {
    // The count is unknown; the banner stays as it was and the guide is still reachable.
  }
}

onMounted(() => void refresh());
// Marking a wallet as moved, adding or removing one each end with a navigation.
watch(
  () => [route.fullPath, accountsStore.selectedWallet.address],
  () => void refresh()
);

const open = () => router.push({ name: Components.SecurityNoticeGuide });
</script>

<style lang="scss" scoped>
.legacy-exposure-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 $default-padding 8px;
  padding: 8px 10px;
  border: 1px solid $simple-orange-color;
  border-radius: $default-border-radius;
  background: $secondary-background-color;
  color: $default-white;
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: left;
}

.legacy-exposure-banner__text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.legacy-exposure-banner__action,
.legacy-exposure-banner__dismiss {
  flex-shrink: 0;
  padding: 4px;
  border: 0;
  background: transparent;
  color: $pink-lavender-color;
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 2px;
  }
}

.legacy-exposure-banner__action {
  font-weight: 700;
}

.legacy-exposure-banner__dismiss {
  display: inline-flex;
  color: $grayish-white;
}
</style>
