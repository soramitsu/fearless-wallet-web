<template>
  <div v-if="visible" class="legacy-exposure-banner" role="status" data-testid="legacyExposureBanner">
    <span class="legacy-exposure-banner__text">{{ tc('exposureNotice.reminder', count, { count }) }}</span>

    <button type="button" class="legacy-exposure-banner__action" data-testid="legacyExposureBannerOpen" @click="open">
      {{ t('exposureNotice.openGuide') }}
    </button>

    <button
      type="button"
      class="legacy-exposure-banner__dismiss"
      :aria-label="t('common.close')"
      data-testid="legacyExposureBannerDismiss"
      @click="dismissed = true"
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
import { walletsStillToMove } from '@/util/legacyExposure';

const route = useRoute();
const router = useRouter();
const { t, tc } = useI18n();

// Old wallets from before the update from 3.0.x that still hold their place in the app and are not
// marked as moved. A reminder only: closing it hides it until the wallet window opens again.
const status = ref<LegacyExposureStatus>();
const dismissed = ref(false);
const count = computed(() => walletsStillToMove(status.value).length);
const visible = computed(() => count.value > 0 && !dismissed.value);

async function refresh(): Promise<void> {
  // Nothing to remind once the background has said there is nothing to tell.
  if (status.value?.state === 'not_exposed') return;

  try {
    status.value = await getLegacyExposureStatus();
  } catch {
    // The count is unknown; the banner stays as it was and the guide is still reachable.
  }
}

onMounted(() => void refresh());
// Marking a wallet as moved, adding or removing one each end with a navigation.
watch(
  () => route.fullPath,
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
