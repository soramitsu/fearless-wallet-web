<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <div class="bond-form">
      <div>
        <template v-if="step === 1">
          <FInput v-model="accountName" placeholder="accounts.account" size="big" :readonly="true" />

          <SelectInput
            v-if="showAmountInput"
            class="amount-input"
            text="assets.amount"
            :transferableAmount="transferableAmount"
            :value="amountPriceValue"
            :asset="stakingAssetName"
            :assetId="stakingAssetId"
            :amount="amount"
            @update:amount="updateAmount"
            @setMax="setMax"
          />

          <Hint class="hint" iconName="notification" :text="text" />

          <InputWithIcon
            v-model="payoutAddress"
            icon="close"
            placeholder="staking.payoutAccount"
            @click="setPayoutAddress"
          />

          <div class="activity-buttons">
            <BadgeButton text="common.paste" @click="paste" />
          </div>

          <InfoRow
            text="assets.networkFee"
            borderType="default"
            icon="info"
            :value="`${fee} ${stakingAssetName}`"
            :price="feeValueString"
            :iconClasses="['network-fee']"
          />
        </template>

        <SelectionValidatorsForm
          v-else-if="showSelectionValidatorsForm"
          :step="step"
          :validators="validators"
          :maxNominations="maxNominations"
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
              :value="`${selectedValidatorsLength} (${$t('common.max')} ${maxNominations})`"
              borderType="default"
            />

            <InfoRow text="accounts.account" :value="selectedAccountName" borderType="default" />

            <InfoRow text="assets.amount" :value="amount" borderType="default" :price="amountValueString" />

            <InfoRow
              text="assets.networkFee"
              borderType="default"
              icon="info"
              :value="`${fee} ${stakingAssetName}`"
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
              {{ $t('staking.unstakeTokens', days) }}
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

      <FButton
        v-if="showBtn"
        width="100%"
        size="big"
        fontSize="big"
        :text="btnText"
        :disabled="confirmBtnDisabled"
        @click="confirm"
      />
    </div>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="amount"
      :value="amountPriceValue"
      :firstIcon="stakingAssetId"
      :tx="tx"
      extrinsicType="bond"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { RequestBond } from '@extension-base/services/staking-service/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import type { NetworkParams, SelectionValidator } from '@/interfaces';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/validators/FiltersPopup.vue';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';
import { getSoraFees, getValidators } from '@/extension/messaging';
import { calcTransferableSendMinusFee, getUtilityAsset, isValidAmountAsset } from '@/helpers/currencies';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import BaseApi from '@/util/BaseApi';
import { getClipboard } from '@/helpers';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

@Component({
  components: {
    FiltersPopup,
    SelectValidator,
    SelectionValidatorsForm,
    ConfirmationPasswordPopup,
  },
})
export default class Bond extends Vue {
  state: Record<string, SelectionValidator> = {};
  payoutAddress = '';
  validators: FWValidatorInfoFull[] = [];
  step = 1;
  isSuggested = false;
  showConfirmationPasswordPopup = false;
  fee = '';
  amount = '';

  @Prop({ type: Object }) networkParams!: NetworkParams;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];

  get isValidPayoutAddress() {
    if (this.payoutAddress === '') return true;

    return BaseApi.validateAddress(this.payoutAddress, this.network);
  }

  get showBtn() {
    return this.step !== 2;
  }

  get network() {
    return this.networkParams.network;
  }

  get stakingAssetId() {
    if (this.balances.length === 0) return '';

    const { assetId } = getUtilityAsset(this.balances, this.network);

    return assetId;
  }

  get stakingCurrency() {
    return this.balances.find(({ assetId }) => assetId === this.stakingAssetId);
  }

  get accountName() {
    return this.selectedWallet.name;
  }

  get stakingCurrencyBalance() {
    return this.stakingCurrency?.balances.find(({ name }) => name.toLowerCase() === this.network.toLowerCase());
  }

  get amountPriceValue() {
    return getCostOfAssets(this.amount, this.stakingAssetPrice).toString();
  }

  get transferableAmount() {
    return +(this.stakingCurrencyBalance?.transferable ?? 0);
  }

  get btnText() {
    if (this.step === 1) return 'common.next';

    if (this.step === 3) return 'common.iAgree';

    return 'common.confirm';
  }

  get isValidAmountAsset() {
    return isValidAmountAsset(this.stakingCurrency, this.network, this.fee ?? '0', this.amount);
  }

  get confirmBtnDisabled() {
    if (this.step === 1)
      return this.amount === '' || +this.amount === 0 || !this.isValidAmountAsset || !this.isValidPayoutAddress;

    if (this.step === 4 || this.step === 5) return this.selectedValidatorsLength === 0;

    return false;
  }

  get showAmountInput() {
    return this.step === 1;
  }

  get header() {
    if (this.step === 1) return 'staking.bond';

    if (this.step === 2) return 'staking.validators';

    if (this.step === 3) return 'common.warning';

    if (this.step === 4) return 'staking.recommended';

    if (this.step === 5) return 'staking.yourself';

    if (this.step === 6) return 'common.confirmation';

    return '';
  }

  get showBackIcon() {
    return this.step !== 1;
  }

  get showSelectionValidatorsForm() {
    return this.step !== 1 && this.step !== 6;
  }

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get text() {
    return {
      text: 'staking.minimumStake',
      localeProps: {
        value: this.networkParams.minBond,
        asset: this.stakingAssetName.toUpperCase(),
      },
    };
  }

  get stakingAssetName() {
    return this.stakingCurrency?.symbol ?? '';
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get amountValueString() {
    const value = +this.amount * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get feeValueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get maxNominations() {
    const maxNominations = this.networkParams.maxNominations;

    // Если количество валидаторов в сети меньше, чем maxNominations, то отображаем количество валидаторов как maxNominations
    if (this.validators.length < maxNominations) return this.validators.length;

    return maxNominations;
  }

  get selectedValidators() {
    return Object.values(this.state)
      .filter(({ isSelect }) => isSelect)
      .map(({ address }) => address);
  }

  get selectedValidatorsLength() {
    return this.selectedValidators.length;
  }

  get days() {
    return { value: this.networkParams.unbondPeriod };
  }

  get tx() {
    return {
      amount: this.amount,
      from: this.selectedWallet.address,
      networkName: this.network,
      controllerAddress: '',
      validators: this.selectedValidators,
    } as RequestBond;
  }

  async mounted() {
    this.validators = await getValidators({ networkName: this.network });

    console.info('validators', this.validators);

    this.validators.forEach(({ address, apy, name, description }) => {
      Vue.set(this.state, address, {
        name,
        address,
        apy,
        description,
        isSelect: false,
      });
    });

    this.getSoraFees();
  }

  async getSoraFees() {
    const { StakingBond } = await getSoraFees();

    this.fee = StakingBond;
  }

  openValidatorList(isSuggested: boolean) {
    this.validators = this.validators.map((validator, index) => {
      const isSelect = isSuggested && index < this.maxNominations; // валидаторы возвращаются от "лучшего" к "худшему", по этому берем первых в нужном количестве

      return { ...validator, isSelect };
    });

    this.isSuggested = isSuggested;
    this.step = isSuggested ? 3 : 5;
  }

  updateAmount(amount: string) {
    this.amount = amount;
  }

  updateSelectedValidators(value: boolean, address: string) {
    this.state[address].isSelect = value;
  }

  openAboutRewards() {
    console.info('openAboutRewards');
  }

  handlerBack() {
    if (this.step === 6 && this.isSuggested) this.step -= 1;
    else if (this.step === 5) this.step -= 2;

    this.step -= 1;
  }

  paste() {
    this.payoutAddress = getClipboard();
  }

  confirm() {
    if (this.step === 4) this.step += 1;

    if (this.step === 6) this.showConfirmationPasswordPopup = true;
    else this.step += 1;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  closeForm() {
    this.$emit('closeBond');
  }

  calcTransferableSendMinusFee() {
    return calcTransferableSendMinusFee(this.stakingCurrency, this.network, this.fee);
  }

  setPayoutAddress(address = '') {
    this.payoutAddress = address;
  }

  async setMax() {
    if (!this.stakingCurrency) return;

    this.amount = this.calcTransferableSendMinusFee().toString();
  }
}
</script>

<style lang="scss" scoped>
.bond-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .hint {
    padding: $default-padding;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 15px;
  }

  .amount-input {
    margin-top: 10px;
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
