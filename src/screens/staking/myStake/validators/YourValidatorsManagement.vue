<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <div class="your-validators">
      <ValidatorInfo
        v-if="showValidatorInfo"
        :validator="selectedValidator"
        :stakingNetwork="stakingNetwork"
        :stakingCurrency="stakingCurrency"
      />

      <YourValidators v-else-if="step === 1" :stakingNetwork="stakingNetwork" @openValidatorInfo="openValidatorInfo" />

      <div v-else-if="step === 6">
        <FInput v-model="selectedAccountName" placeholder="accounts.account" size="big" :readonly="true" />

        <InfoRow
          text="staking.selectedValidators"
          :value="`${selectedValidatorsLength} (${$t('common.max')} ${maxNominations})`"
          borderType="default"
        />

        <InfoRow
          text="assets.networkFee"
          :value="`${fee} ${stakingAssetName}`"
          :price="feeValueString"
          borderType="default"
          icon="info"
          :iconClasses="['network-fee']"
        />

        <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />
      </div>

      <SelectionValidatorsForm
        v-else
        :step="step"
        :validators="validators"
        :maxNominations="maxNominations"
        @openValidatorList="openValidatorList"
        @updateSelectedValidators="updateSelectedValidators"
      />

      <FButton
        v-if="showConfirmButton"
        size="big"
        fontSize="big"
        width="100%"
        :text="buttontext"
        :disabled="confirmBtnDisabled"
        @click="openSelectionValidatorsForm"
      />

      <ConfirmationPasswordPopup
        v-if="showConfirmationPasswordPopup"
        :currency="stakingCurrency"
        :firstIcon="stakingAssetId"
        :tx="tx"
        :fee="fee"
        :feeValue="feeValue"
        extrinsicType="nominate"
        @close="confirmationPasswordPopupClose"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { type FWValidatorInfoFull, type RequestNominate } from '@extension-base/services/staking-service/types';
import type { AsyncFn, SelectionValidator } from '@/interfaces';
import type { GetAssetPrice, GetStakingNetworkProps, NetworkParams, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';
import YourValidators from '@/screens/staking/myStake/validators/YourValidators.vue';
import ValidatorInfo from '@/screens/staking/myStake/validators/ValidatorInfo.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { fetchBalance, getSoraFees } from '@/extension/messaging';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { ActionTypes as StakingActionTypes } from '@/store/staking/actions';
import { isValidAmountAsset } from '@/helpers/currencies';

@Component({
  components: {
    ValidatorInfo,
    YourValidators,
    SelectionValidatorsForm,
    ConfirmationPasswordPopup,
  },
})
export default class YourValidatorsManagement extends Vue {
  state: Record<string, SelectionValidator> = {};
  showConfirmationPasswordPopup = false;
  step = 1;
  isSuggested = false;
  selectedValidator: FWValidatorInfoFull | null = null;
  fee = '0';
  stashBalance = '0';

  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Action(StakingActionTypes.GET_MY_STAKING_INFO) getMyStakingInfo!: AsyncFn<GetStakingNetworkProps>;

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get network() {
    return this.stakingNetwork.network;
  }

  get stakingAssetName() {
    return this.stakingCurrency.symbol;
  }

  get stakingAssetId() {
    return this.stakingCurrency.assetId;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get feeValueString() {
    return `${this.fiatSymbol}${this.$n(+this.feeValue, 'price')}`;
  }

  get showConfirmButton() {
    return this.step !== 2 && !this.showValidatorInfo;
  }

  get isValidAmountAsset() {
    // для controller аккаунта подставляем баланс stash аккаунта
    const stakingCurrency: TokenBalance = this.stakingNetwork.isController
      ? {
          ...this.stakingCurrency,
          balances: this.stakingCurrency.balances.map((item) => ({ ...item, transferable: this.stashBalance })),
        }
      : this.stakingCurrency;

    return isValidAmountAsset(stakingCurrency, this.stakingNetwork.network, this.fee ?? '0', '0');
  }

  get confirmBtnDisabled() {
    if (this.step === 4 || this.step === 5) return this.selectedValidatorsLength === 0;

    if (this.step === 6) return !this.isValidAmountAsset;

    return false;
  }

  get buttontext() {
    if (this.step === 1) {
      if (!this.isValidAmountAsset)
        return { text: 'assets.insufficientBalance', localeProps: { asset: this.stakingAssetName.toUpperCase() } };

      return 'common.edit';
    }

    return 'common.confirm';
  }

  get showBackIcon() {
    return this.step !== 1 || this.showValidatorInfo;
  }

  get feeValue() {
    return getCostOfAssets(this.fee, this.stakingAssetPrice).toString();
  }

  get header() {
    if (this.showValidatorInfo) return 'staking.validatorInfo';

    if (this.step === 1) return 'staking.yourValidators';

    if (this.step === 2) return 'staking.validators';

    if (this.step === 3) return 'common.warning';

    if (this.step === 4) return 'staking.recommended';

    if (this.step === 5) return 'staking.yourself';

    if (this.step === 6) return 'common.confirmation';

    return '';
  }

  get maxNominations() {
    const maxNominations = this.stakingNetwork.maxNominations;

    // Если количество валидаторов в сети меньше, чем maxNominations, то отображаем количество валидаторов как maxNominations
    if (this.validators.length < maxNominations) return this.validators.length;

    return maxNominations;
  }

  get showValidatorInfo() {
    return this.selectedValidator !== null;
  }

  get validators() {
    return Object.values(this.state);
  }

  get selectedValidatorsLength() {
    return this.selectedValidators.length;
  }

  get selectedValidators() {
    return Object.values(this.state)
      .filter(({ isSelect }) => isSelect)
      .map(({ address }) => address);
  }

  get tx() {
    return {
      from: this.selectedWallet.address,
      networkName: this.network,
      validators: this.selectedValidators,
    } as RequestNominate;
  }

  async mounted() {
    // TODO staking
    const isSlashed = false;
    const limitValidatorsIdentity = false;

    this.stakingNetwork.validators.forEach(({ address, apy, name, description, isOversubscribed, isKnownGood }) => {
      Vue.set(this.state, address, {
        name,
        address,
        apy,
        description,
        isOversubscribed,
        onchainIdentity: isKnownGood,
        isSlashed,
        limitValidatorsIdentity,
        isSelect: false,
      });
    });

    this.getSoraFees();

    if (this.stakingNetwork.isController)
      this.stashBalance = await fetchBalance({
        address: this.stakingNetwork.stashAddress,
        networkName: this.stakingNetwork.network,
      });
  }

  async getSoraFees() {
    const { StakingNominate } = await getSoraFees();

    this.fee = StakingNominate.toString();
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) {
      this.getMyStakingInfo({ network: this.network });
      this.closeForm();
    }
  }

  openValidatorList(isSuggested = false) {
    this.validators.forEach(
      (validator, index) => (this.state[validator.address].isSelect = isSuggested && index < this.maxNominations) // валидаторы возвращаются от "лучшего" к "худшему", по этому берем первых в нужном количестве
    );

    this.isSuggested = isSuggested;
    this.step = isSuggested ? 3 : 5;
  }

  updateSelectedValidators(value: boolean, address: string) {
    this.state[address].isSelect = value;
  }

  openSelectionValidatorsForm() {
    if (this.step === 4) this.step += 1;

    if (this.step === 6) this.showConfirmationPasswordPopup = true;
    else this.step += 1;
  }

  openValidatorInfo(validator: FWValidatorInfoFull) {
    this.selectedValidator = validator;
  }

  handlerBack() {
    if (this.showValidatorInfo) {
      this.selectedValidator = null;

      return;
    }

    if (this.step === 6 && this.isSuggested) this.step -= 1;
    else if (this.step === 5) this.step -= 2;

    this.step -= 1;
  }
}
</script>

<style lang="scss" scoped>
.your-validators {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
</style>
