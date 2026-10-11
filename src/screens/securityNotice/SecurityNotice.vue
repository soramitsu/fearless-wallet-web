<template>
  <AboveForm
    :fullScreen="true"
    header="exposureNotice.title"
    :showCloseIcon="isAcknowledged"
    @closeHandler="openGuide"
  >
    <div class="security-notice" data-testid="securityNotice">
      <h1 class="security-notice__heading" data-testid="securityNoticeHeading">{{ t('exposureNotice.heading') }}</h1>

      <p class="security-notice__text">{{ t('exposureNotice.whatHappened', LEGACY_EXPOSURE_VERSIONS) }}</p>
      <p class="security-notice__text">{{ t('exposureNotice.thisVersion') }}</p>
      <p class="security-notice__text">{{ t('exposureNotice.whatWeKnow') }}</p>

      <section v-if="wallets.length" class="security-notice__wallets" aria-labelledby="securityNoticeWalletsTitle">
        <h2 id="securityNoticeWalletsTitle" class="security-notice__subheading">
          {{ t('exposureNotice.walletsTitle') }}
        </h2>

        <ul class="security-notice__list">
          <li
            v-for="wallet in wallets"
            :key="wallet.address"
            class="security-notice__wallet"
            data-testid="securityNoticeWallet"
          >
            <span class="security-notice__wallet-name">{{ wallet.name || cut(wallet.address) }}</span>
            <span class="security-notice__wallet-address">{{ cut(wallet.address) }}</span>
            <template v-if="!wallet.present">
              <span class="security-notice__wallet-removed">{{ t('exposureNotice.walletRemoved') }}</span>
              <span class="security-notice__wallet-hint">{{ t('exposureNotice.walletRemovedHint') }}</span>
            </template>
          </li>
        </ul>
      </section>

      <p class="security-notice__text security-notice__text--key">{{ t('exposureNotice.whatItMeans') }}</p>
      <p class="security-notice__text">{{ t('exposureNotice.passwordAdvice') }}</p>
      <p class="security-notice__text">{{ t('exposureNotice.whatToDo') }}</p>

      <template v-if="isAcknowledged">
        <FButton
          class="security-notice__action"
          text="exposureNotice.openGuide"
          size="big"
          data-testid="securityNoticeOpenGuide"
          @click="openGuide"
        />
      </template>

      <template v-else>
        <p class="security-notice__text">{{ t('exposureNotice.enrollmentHold') }}</p>

        <Checkbox
          class="security-notice__confirm"
          :label="t('exposureNotice.confirm')"
          :value="confirmed"
          data-testid="securityNoticeConfirm"
          @change="confirmed = $event"
        />

        <p v-if="failed" class="security-notice__error" role="alert" data-testid="securityNoticeError">
          {{ t('exposureNotice.acknowledgeFailed') }}
        </p>

        <FButton
          class="security-notice__action"
          text="exposureNotice.continue"
          size="big"
          :disabled="!confirmed || busy"
          :loading="busy"
          data-testid="securityNoticeContinue"
          @click="acknowledge"
        />
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LegacyExposureStatus } from '@extension-base/services/legacy-exposure-service';
import AboveForm from '@/components/AboveForm.vue';
import Checkbox from '@/components/Checkbox.vue';
import FButton from '@/components/FButton.vue';
import { acknowledgeLegacyExposure, getLegacyExposureStatus } from '@/extension/messaging/legacy-exposure';
import { cut } from '@/helpers';
import { useI18n } from '@/locales/useI18n';
import { Components } from '@/router/routes';
import { LEGACY_EXPOSURE_VERSIONS } from '@/util/legacyExposure';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const status = ref<LegacyExposureStatus>();
const confirmed = ref(false);
const busy = ref(false);
const failed = ref(false);

const wallets = computed(() => status.value?.wallets ?? []);
const isAcknowledged = computed(() => status.value?.state === 'acknowledged');

// Where the user was going when the notice stopped them; the guide offers the way back.
const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : undefined));

onMounted(async () => {
  try {
    status.value = await getLegacyExposureStatus();
  } catch {
    // The router asked the same question a moment ago; without an answer the notice still shows
    // its text, and confirming asks the background again.
  }
});

const openGuide = () =>
  router.replace({
    name: Components.SecurityNoticeGuide,
    ...(redirect.value ? { query: { redirect: redirect.value } } : {}),
  });

async function acknowledge(): Promise<void> {
  if (!confirmed.value || busy.value) return;

  busy.value = true;
  failed.value = false;

  try {
    status.value = await acknowledgeLegacyExposure();

    if (status.value.state === 'acknowledged') await openGuide();
    else if (status.value.state === 'not_exposed') await router.replace({ name: Components.Welcome });
    else failed.value = true;
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<style lang="scss" scoped>
.security-notice {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 640px;
  height: 100%;
  margin: 0 auto;
  padding-bottom: $default-padding;
  overflow-y: auto;
  text-align: left;

  &__heading {
    margin: 0 0 4px;
    color: $plain-white;
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.3;
  }

  &__subheading {
    margin: 0 0 8px;
    color: $default-white;
    font-size: 0.875rem;
    font-weight: 700;
  }

  &__text {
    margin: 0;
    color: $grayish-white;
    line-height: 1.5;

    &--key {
      padding: 10px 12px;
      border-left: 3px solid $simple-orange-color;
      border-radius: $default-border-radius;
      background-color: $secondary-background-color;
      color: $default-white;
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__wallet {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    padding: 10px 12px;
    border: $default-border;
    border-radius: $default-border-radius;
    background-color: $secondary-background-color;
  }

  &__wallet-name {
    min-width: 0;
    overflow: hidden;
    color: $default-white;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__wallet-address {
    color: $grayish-white;
    font-size: 0.8125rem;
  }

  &__wallet-removed,
  &__wallet-hint {
    grid-column: 1 / -1;
    color: $grayish-white;
    font-size: 0.8125rem;
  }

  &__wallet-removed {
    color: $simple-orange-color;
  }

  &__confirm {
    margin-top: 4px;
  }

  &__error {
    margin: 0;
    color: $pink-color;
    font-size: 0.8125rem;
  }

  &__action {
    margin-top: 4px;
  }
}
</style>
