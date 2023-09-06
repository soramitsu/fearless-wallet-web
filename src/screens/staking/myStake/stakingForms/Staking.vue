<template>
  <div class="staking-form">
    <template v-if="step === 1">
      <Hint class="hint" iconName="notification" :text="text" />

      <FInput v-model="payoutAccount" placeholder="staking.payoutAccount" size="big" />

      <InfoRow
        text="staking.payout"
        :value="`${payout} ${rewardedAsset}`"
        :price="payoutValueString"
        borderType="default"
        icon="info"
        :iconClasses="['payout']"
      />

      <Tooltip text="staking.payout" target=".payout" placement="right" />

      <InfoRow
        text="assets.networkFee"
        borderType="default"
        icon="info"
        :value="`${fee} ${stakingAsset}`"
        :price="feeValueString"
        :iconClasses="['network-fee']"
      />
    </template>

    <SelectionValidatorsForm
      v-else-if="showSelectionValidatorsForm"
      :step="step"
      :validators="validators"
      :maxValidators="maxValidators"
      @openValidatorList="openValidatorList"
      @updateSelectedValidators="updateSelectedValidators"
    />

    <template v-if="step === 6">
      <div class="asset-logo">
        <Icon icon="asset-background" class="asset-background" :hover="false" />

        <AssetIcon :icon="stakingCurrency.icon" :shadowColor="stakingCurrency.color" class="asset-highlight" />
      </div>

      <ContentForm :height="200" :isStaticHeight="true" :bottomRightCorner="true">
        <InfoRow
          text="staking.selectedValidators"
          :value="`${selectedQuantity} (${$t('common.max')} ${maxValidators})`"
          borderType="default"
        />

        <InfoRow text="accounts.account" :value="selectedAccountName" borderType="default" />

        <InfoRow text="assets.amount" :value="amount" borderType="default" :price="amountValueString" />

        <InfoRow
          text="assets.networkFee"
          borderType="default"
          icon="info"
          :value="`${fee} ${stakingAsset}`"
          :price="feeValueString"
          :iconClasses="['network-fee']"
        />
      </ContentForm>
    </template>

    <template v-if="step === 1 || step === 6">
      <FLink text="staking.learnAboutRewards" class="about-rewards" @click="openAboutRewards" />

      <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />
    </template>

    <template v-if="step === 6">
      <div class="descriptions-row">
        <Icon icon="gift" class="icon" />

        <div>
          {{ $t('staking.stakedTokens') }}
        </div>
      </div>

      <div class="descriptions-row">
        <Icon icon="information-rectangle" class="icon" />

        <div>
          {{ $t('staking.unstakeTokens') }}
        </div>
      </div>

      <div class="descriptions-row">
        <Icon icon="wallet-remove" class="icon" />

        <div>
          {{ $t('staking.tokensUnstaking') }}
        </div>
      </div>

      <div class="descriptions-row">
        <Icon icon="logout" class="icon" />

        <div>
          {{ $t('staking.afterUnstaking') }}
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { validators } from '../validators/mock';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import type { SelectionValidator } from '@/interfaces';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/validators/FiltersPopup.vue';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';

@Component({
  components: {
    FiltersPopup,
    SelectValidator,
    SelectionValidatorsForm,
  },
})
export default class StakingForm extends Vue {
  state: Record<string, SelectionValidator> = {};
  payoutAccount = '';
  payout = '1';
  validators = validators;

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: String }) amount!: string;
  @Prop({ type: Number }) step!: number;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get showSelectionValidatorsForm() {
    return this.step !== 1 && this.step !== 6;
  }

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get text() {
    return {
      text: 'staking.minimumStake',
      localeProps: { value: this.minStake, asset: this.stakingAsset.toUpperCase() },
    };
  }

  get minStake() {
    return 10;
  }

  get stakingAsset() {
    return this.stakingCurrency.symbol;
  }

  get rewardedAsset() {
    return this.rewardedCurrency.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardedAssetPrice() {
    const priceId = this.rewardedCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get payoutValueString() {
    const value = +this.payout * this.rewardedAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get amountValueString() {
    const value = +this.amount * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get feeValueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get maxValidators() {
    return 24;
  }

  get selectedQuantity() {
    return Object.values(this.state).filter(({ isSelect }) => isSelect).length;
  }

  mounted() {
    this.validators.forEach(({ name, address, apy, description, isSelect }) =>
      Vue.set(this.state, address, {
        name,
        address,
        apy,
        description,
        isSelect,
      })
    );
  }

  openValidatorList(isSuggested: boolean) {
    this.validators = this.validators.map((validator) => {
      const isSelect = isSuggested ? !!validator.isRecommended : false;

      return { ...validator, isSelect };
    });

    this.$emit('openValidatorList', isSuggested);
  }

  updateSelectedValidators(value: boolean, address: string) {
    this.state[address].isSelect = value;
  }

  openAboutRewards() {
    console.info('openAboutRewards');
  }
}
</script>

<style lang="scss" scoped>
.staking-form {
  .hint {
    padding: $default-padding;
  }

  .about-rewards {
    margin: 20px 16px 16px;
  }

  .descriptions-row {
    display: flex;
    align-items: center;
    color: $default-white;
    text-align: left;
    line-height: 20px;
    margin: 20px 16px 16px;
    font-size: 14px;

    .icon {
      margin-right: 10px;
      max-width: 20px;
      height: 20px;
    }
  }

  .asset-logo {
    display: flex;
    align-items: center;
    margin-bottom: 30px;
    height: 200px;

    .asset-background {
      position: relative;
      height: 200px;
      left: 115px;
    }

    .asset-highlight {
      position: relative;
      left: -83px;
    }
  }
}
</style>
