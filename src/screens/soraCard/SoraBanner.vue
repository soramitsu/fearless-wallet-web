<template>
  <div v-if="showBanner" class="sora-banner">
    <Icon icon="sora-card-banner" class="banner" :style="iconStyle" />

    <CircleButton
      backgroundColor="light-black"
      iconName="close-thin"
      size="small"
      class="close-button"
      @click="hideBanner"
    />

    <button class="status-card-button" @click="openSoraCardForm">{{ statusText }}</button>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import type { TMutation } from '@/interfaces';
import type { SetSoraCardBannerVisibility } from '@/store';
import { SORA_CARD_BANNER_HEIGHT } from '@/consts/global';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';

@Component
export default class SoraBanner extends Vue {
  @Getter(AccountsGettersTypes.getShowSoraCardBanner) getShowSoraCardBanner!: boolean;
  @Mutation(AccountsMutationTypes.SET_SORA_CARD_BANNER_VISIBILITY)
  setSoraCardBannerVisibility!: TMutation<SetSoraCardBannerVisibility>;

  get statusText() {
    return 'Get SORA Card';
  }

  get showBanner() {
    return this.getShowSoraCardBanner;
  }

  get iconStyle() {
    const styles: Record<string, string> = {
      height: `${SORA_CARD_BANNER_HEIGHT}px`,
    };

    return styles;
  }

  hideBanner() {
    this.setSoraCardBannerVisibility({ value: false });
  }

  openSoraCardForm() {
    console.info('openSoraCardForm');
  }
}
</script>

<style scoped lang="scss">
.sora-banner {
  display: flex;

  .banner {
    width: calc($extension-width - $default-padding - $default-padding);
  }

  .close-button {
    margin: 20px 0 0 -24px;
  }

  .status-card-button {
    margin: 80px 0 0 -322px;
    background: #131313;
    border-radius: 16px;
    border: none;
    height: 33px;
    width: 130px;
    font-weight: 700;
    font-size: 12px;
    color: $plain-white;
    cursor: pointer;

    &:hover {
      background: #201f1f;
    }
  }
}
</style>
