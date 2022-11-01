<template>
  <Corners size="big">
    <div :class="contentClasses" @click="updateSelectedWallet">
      <div class="content">
        <div v-if="name" class="name">{{ name }}</div>
        <span class="balance">{{ fiatSymbol }}{{ balanceString }}</span>
        <!-- <div :class="percentClasses">{{ percentString }}</div> -->
      </div>
      <Icon v-if="isMobile" icon="mobile" />

      <div class="dots-container" :ref="dotsHorizontalRef">
        <!-- <div :ref="dotsHorizontalRef"> -->
        <Icon icon="dots-horizontal" className="dots" />
        <!-- </div> -->
      </div>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import Corners from '@/components/Corners.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { formattedNumber } from '@/helpers/numbers';

@Component({
  components: { Corners },
})
export default class WalletBalance extends Vue {
  readonly dotsHorizontalRef = 'dotsHorizontal';
  showWalletMenu = false;

  @Prop({ default: '' }) name!: string;
  @Prop(String) balance!: string;
  @Prop(Boolean) isMobile!: boolean;
  @Prop(Number) percent!: number;
  @Prop({ default: false }) isSelected!: boolean;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get balanceString() {
    return formattedNumber(+this.balance);
  }

  get percentString() {
    const sign = this.percent > 0 ? '+' : '';
    const signPercent = this.percent !== 0 ? '%' : '';

    return `${sign}${formattedNumber(this.percent)}${signPercent}`;
  }

  get percentClasses() {
    const classes = ['percent'];

    if (this.percent > 0) classes.push('up-percent');
    else if (this.percent < 0) classes.push('down-percent');

    return classes;
  }

  get contentClasses() {
    return [
      'wallet-balance',
      {
        'is-selected': this.isSelected,
      },
    ];
  }

  updateSelectedWallet(event: Event) {
    const classList = (event.target as HTMLDivElement)?.classList;

    if (!(classList.contains('dots-container') || classList.contains('dots'))) this.$emit('updateSelectedWallet');
    else {
      const buttonTop = (this.$refs[this.dotsHorizontalRef] as Element).getBoundingClientRect().top;

      this.$emit('setShowWalletDetailsPopupVisible', buttonTop);
    }
  }
}
</script>

<style lang="scss" scoped>
.wallet-balance {
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
  }

  .balance {
    font-weight: 800;
    font-size: 18px;
    line-height: 23px;
    max-width: 170px;
    text-overflow: ellipsis;
    overflow-x: hidden;
  }

  .percent {
    font-size: 12px;
    line-height: 18px;
  }

  .up-percent {
    color: $success-color;
  }

  .down-percent {
    color: $delete-color;
  }

  .s-icon-basic-check-mark-24 {
    color: $pink-lavender-color;
  }

  .dots-container {
    height: 30px;
    width: 30px;
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
}

.is-selected {
  background: $pink-purple-color;
}
</style>
