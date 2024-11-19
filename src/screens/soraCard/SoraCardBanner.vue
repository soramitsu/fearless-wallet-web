<template>
  <div v-if="accountsStore.showSoraCardBanner" class="sora-banner">
    <img src="@/assets/icons/sora-card-banner.png" class="banner" alt="sora card banner" />

    <div class="close-button" @click="hideBanner">
      <Icon icon="close-thin" class="close-icon" />
    </div>

    <button class="status-card-button" @click="openSoraCardForm">{{ $t(statusText) }}</button>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { VerificationStatus } from '@/consts/soraCard';
import { Components } from '@/router/routes';
import { windowOpen } from '@/extension/messaging';
import { IS_POPUP } from '@/consts/globalClient';
import { useAccountsStore } from '@/stores/accounts';
import { useSoraCardStore } from '@/stores/soraCard';

@Component({})
export default class SoraCardBanner extends Vue {
  accountsStore = useAccountsStore();
  soraCardStore = useSoraCardStore();

  get statusText() {
    if (this.soraCardStore.currentStatus !== null && this.soraCardStore.currentStatus !== VerificationStatus.None)
      return `soraCard.statuses.${this.soraCardStore.currentStatus?.toLowerCase()}.statusText`;

    return 'soraCard.getCard';
  }

  hideBanner() {
    this.accountsStore.setSoraCardBannerVisibility(false);
  }

  openSoraCardForm() {
    if (IS_POPUP) windowOpen('/sora-card');

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
