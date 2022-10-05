<template>
  <Corners size="big">
    <div :class="contentClasses" @click="updateSelectedWallet">
      <div>
        <div v-if="name" class="name">{{ name }}</div>
        <div v-if="isMobile" class="mobile">mobile</div>
        <div class="balance">{{ fiatSymbol }}{{ balanceString }}</div>
        <!-- <div :class="percentClasses">{{ percentString }}</div> -->
      </div>

      <div class="dots-container">
        <img src="@/assets/dots-horizontal.svg" class="dots" :ref="dotsHorizontalRef" />
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
  justify-content: space-between;
  align-items: center;
  text-align: left;
  opacity: 0.9;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px $default-padding;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  user-select: none;

  &:hover {
    cursor: pointer;
    opacity: 1;
  }

  .name {
    margin-bottom: 4px;
  }

  .mobile {
    position: absolute;
    top: 10px;
    right: 60px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.05);
    letter-spacing: 0.03em;
    line-height: 15px;
    text-transform: uppercase;
    border-radius: 30px;
    text-align: center;
    padding: 2px 6px;
  }

  .balance {
    font-weight: 800;
    font-size: 22px;
    line-height: 28px;
    max-width: 220px;
  }

  .percent {
    font-size: 12px;
    line-height: 18px;
  }

  .up-percent {
    color: #00ffcc;
  }

  .down-percent {
    color: #d0021b;
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
  background: rgba(119, 0, 238, 0.25);
}
</style>
