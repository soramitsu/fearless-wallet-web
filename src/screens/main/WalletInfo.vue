<template>
  <Corners size="big">
    <div :class="contentClasses" @click="updateSelectedWallet">
      <div class="content">
        <div class="name">{{ name }}</div>

        <!-- <WalletBalance class="balance" :balance="balance" :changeWalletBalance="changeWalletBalance" /> -->
      </div>

      <Icon v-if="isMobile" icon="mobile" className="mobile" />

      <div class="dots-container" :ref="dotsHorizontalRef">
        <Icon icon="dots-horizontal" className="dots" />
      </div>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { ChangeWalletBalance } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { CustomEvent } from '@/interfaces';
import WalletBalance from '@/screens/main/WalletBalance.vue';

@Component({
  components: { WalletBalance },
})
export default class WalletInfo extends Vue {
  readonly dotsHorizontalRef = 'dotsHorizontal';
  showWalletMenu = false;
  $refs!: {
    dotsHorizontal: HTMLDivElement;
  };

  @Prop({ default: '' }) name!: string;
  @Prop(Number) balance!: number;
  @Prop(Boolean) isMobile!: boolean;
  @Prop(Object) changeWalletBalance!: ChangeWalletBalance;
  @Prop({ default: false }) isSelected!: boolean;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get contentClasses() {
    return [
      'wallet-info',
      {
        'is-selected': this.isSelected,
      },
    ];
  }

  updateSelectedWallet({ target: { classList } }: CustomEvent) {
    const shouldUpdateSelectedWallet = !(
      classList.contains('dots-container') ||
      classList.contains('dots') ||
      classList.contains('dots-horizontal') ||
      classList.contains('icon__inner')
    );

    if (shouldUpdateSelectedWallet) this.$emit('updateSelectedWallet');
    else {
      const buttonTop = this.$refs[this.dotsHorizontalRef].getBoundingClientRect().top;

      this.$emit('setShowWalletDetailsPopupVisible', buttonTop);
    }
  }
}
</script>

<style lang="scss" scoped>
.wallet-info {
  display: flex;
  gap: 8px;
  align-items: center;
  text-align: left;
  opacity: 0.9;
  border: 1px solid $default-background-color;
  padding: 10px $default-padding;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border: 1px solid $default-background-color;
  border-radius: 8px;
  background: $secondary-background-color;
  user-select: none;

  &:hover {
    cursor: pointer;
    opacity: 1;
  }

  .content {
    min-height: 45px; // TODO: delete after adding percent
    flex-grow: 1;
  }

  .name {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: $gray-color;
    margin-bottom: 4px;
    max-width: 185px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile {
    width: 18px;
    height: 18px;
  }

  .s-icon-basic-check-mark-24 {
    color: $pink-lavender-color;
  }

  .dots-container {
    height: 25px;
    width: 25px;
    opacity: 0.9;
    display: flex;

    &:hover {
      opacity: 1;
    }

    .dots {
      margin: auto;
      height: 20px;
      width: 20px;
    }
  }

  .balance {
    font-size: 18px;
    line-height: 22px;
  }
}

.is-selected {
  background: $pink-purple-color;
}
</style>
