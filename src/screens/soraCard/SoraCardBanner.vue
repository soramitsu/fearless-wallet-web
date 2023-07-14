<template>
  <div v-if="showSoraCardBanner" class="sora-banner">
    <img src="@/assets/icons/sora-card-banner.png" class="banner" alt="sora card banner" />

    <div class="close-button close-circle" @click="hideBanner">
      <Icon icon="close-thin" class="close-icon" />
    </div>

    <button class="status-card-button" @click="openSoraCardForm">{{ $t(statusText) }}</button>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import type { Fn } from '@/interfaces';
import { VerificationStatus } from '@/consts/soraCard';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import { windowOpen } from '@/extension/messaging';

@Component
export default class SoraCardBanner extends Vue {
  @Getter(AccountsGettersTypes.showSoraCardBanner) showSoraCardBanner!: boolean;
  @Mutation(AccountsMutationTypes.SET_SORA_CARD_BANNER_VISIBILITY)
  setSoraCardBannerVisibility!: Fn<boolean>;
  @Getter(SoraCardGettersTypes.currentStatus) currentStatus!: VerificationStatus;

  get statusText() {
    if (this.currentStatus !== null && this.currentStatus !== VerificationStatus.None)
      return `soraCard.statuses.${this.currentStatus.toLowerCase()}.statusText`;

    return 'soraCard.getCard';
  }

  hideBanner() {
    this.setSoraCardBannerVisibility(false);
  }

  openSoraCardForm() {
    if (BaseApi.useIsPopup()) windowOpen('/sora-card');
    this.$router.push({ name: Components.SoraCard });
  }
}
</script>

<style scoped lang="scss">
.sora-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 120px;

  .banner {
    width: calc($extension-width - $default-padding - $default-padding);
  }

  .close-button {
    position: relative;
    top: -100px;
    left: 250px;
    width: 16px;
    min-height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    .close-icon {
      color: $default-white;
      height: 16px;

      :hover {
        color: $plain-white;
      }
    }

    &:hover {
      .close-icon {
        color: $plain-white;
      }
    }
  }

  .status-card-button {
    position: relative;
    top: -55px;
    background: #131313;
    border-radius: 16px;
    border: none;
    flex: 0 0 33px;
    min-width: 130px;
    max-width: 280px;
    font-weight: 700;
    font-size: 12px;
    padding: 0 10px;
    white-space: nowrap;
    color: $plain-white;
    cursor: pointer;

    &:hover {
      background: #201f1f;
    }
  }
}
</style>
