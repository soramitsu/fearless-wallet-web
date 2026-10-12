<template>
  <div v-if="visible" class="account-access-banner" role="status" data-testid="accountAccessBanner">
    <span class="account-access-banner__text">{{ tc('accountAccess.settingsDescription', count, { count }) }}</span>

    <button type="button" class="account-access-banner__action" data-testid="accountAccessBannerOpen" @click="open">
      {{ t('accountAccess.unlock') }}
    </button>

    <button
      type="button"
      class="account-access-banner__dismiss"
      :aria-label="t('common.close')"
      data-testid="accountAccessBannerDismiss"
      @click="dismissed = true"
    >
      <Icon icon="close" width="16px" height="16px" aria-hidden="true" />
    </button>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getAccessStatus } from '@/extension/messaging';
import { useI18n } from '@/locales/useI18n';
import { Components } from '@/router/routes';

// TON phrases are checked in the background after unlock (about 100 ms each); ask again until that is done.
const SCAN_RECHECK_MS = 1500;
const SCAN_RECHECKS = 4;

const route = useRoute();
const router = useRouter();
const { t, tc } = useI18n();

// Accounts that are in the wallet but whose key still waits for a password or phrase. A reminder only:
// nothing is blocked, and the same list stays reachable in Settings after it is dismissed.
const count = ref(0);
const dismissed = ref(false);
const visible = computed(
  () => count.value > 0 && !dismissed.value && route.name !== Components.AccountAccessRecovery
);

let recheckTimer: ReturnType<typeof setTimeout> | undefined;

async function refresh(rechecksLeft = SCAN_RECHECKS): Promise<void> {
  clearTimeout(recheckTimer);

  try {
    const { issues, scanComplete, hasMasterPassword } = await getAccessStatus();

    count.value = issues.length;

    if (!scanComplete && hasMasterPassword && rechecksLeft > 0) {
      recheckTimer = setTimeout(() => void refresh(rechecksLeft - 1), SCAN_RECHECK_MS);
    }
  } catch {
    // The count is unknown; the banner stays as it was and Settings still lists the accounts.
  }
}

onMounted(() => void refresh());
// Unlocking an account, a password change or a failed send change the list; each ends with a navigation.
watch(
  () => route.fullPath,
  () => void refresh()
);
onBeforeUnmount(() => clearTimeout(recheckTimer));

const open = () => router.push({ name: Components.AccountAccessRecovery });
</script>

<style lang="scss" scoped>
.account-access-banner {
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

.account-access-banner__text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.account-access-banner__action,
.account-access-banner__dismiss {
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

.account-access-banner__action {
  font-weight: 700;
}

.account-access-banner__dismiss {
  display: inline-flex;
  color: $grayish-white;
}
</style>
