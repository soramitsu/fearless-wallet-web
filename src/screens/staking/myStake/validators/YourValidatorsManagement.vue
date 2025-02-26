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
        <FInput
          :value="selectedAccountName"
          placeholder="accounts.account"
          size="big"
          data-testid="accountName"
          :readonly="true"
        />

        <InfoRow
          text="staking.selectedValidators"
          data-testid="selectedValidators"
          :value="`${selectedValidatorsLength} (${$t('common.max')} ${maxNominations})`"
          borderType="default"
        />

        <InfoRow
          text="assets.networkFee"
          data-testid="networkFee"
          :value="`${fee} ${stakingAssetName}`"
          :price="feeValueString"
          borderType="default"
          icon="info"
          :iconClasses="['network-fee']"
        />

        <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
      </div>

      <SelectionValidatorsForm
        v-else
        :step="step"
        :validators="validators"
        :maxNominations="maxNominations"
        :stakingCurrency="stakingCurrency"
        :stakingNetwork="stakingNetwork"
        :selectedValidator="selectedValidator"
        @openValidatorList="openValidatorList"
        @updateSelectedValidators="updateSelectedValidators"
        @openValidatorInfo="openValidatorInfo"
      />

      <FButton
        v-if="showConfirmButton"
        size="big"
        fontSize="big"
        width="100%"
        data-testId="confirmBtn"
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
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';

import type { FWValidatorInfoFull, RequestNominate } from '@extension-base/services/staking-service/types';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import { type SelectionValidator, WalletEcosystem } from '@/interfaces';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';
import YourValidators from '@/screens/staking/myStake/validators/YourValidators.vue';
import ValidatorInfo from '@/screens/staking/myStake/validators/ValidatorInfo.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { fetchBalance, getNominateNetworkFee } from '@/extension/messaging';
import { getCostOfAssets } from '@/helpers/transfers';
import { isValidAmountAsset } from '@/helpers/currencies';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component({
  components: {
    ValidatorInfo,
    YourValidators,
    SelectionValidatorsForm,
    ConfirmationPasswordPopup,
  },
})
export default class YourValidatorsManagement extends Vue {
  networksStore = useNetworksStore();
  stakingStore = useStakingStore();
  accountsStore = useAccountsStore();
  state: Record<string, SelectionValidator> = {};
  showConfirmationPasswordPopup = false;
  step = 1;
  isSuggested = false;
  selectedValidator: FWValidatorInfoFull | null = null;
  fee = '0';
  stashBalance = '0';

  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: Object }) stakingCurrency!: TokenGroup;

  get selectedAccountName() {
    return this.accountsStore.selectedWallet.name;
  }

  get network() {
    return this.stakingNetwork.network;
  }

  get stakingAssetName() {
    return this.stakingCurrency.symbol;
  }

  get stakingAssetId() {
    return this.stakingCurrency.groupId;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.networksStore.getAssetPrice(priceId).price;
  }

  get feeValueString() {
    return `${this.accountsStore.fiatSymbol}${this.$n(+this.feeValue, 'price')}`;
  }

  get showConfirmButton() {
    return this.step !== 2 && !this.showValidatorInfo;
  }

  get isValidAmountAsset() {
    // для controller аккаунта подставляем баланс stash аккаунта
    const stakingCurrency: TokenGroup = this.stakingNetwork.isController
      ? {
          ...this.stakingCurrency,
          balances: this.stakingCurrency.balances.map((item) => ({ ...item, transferable: this.stashBalance })),
        }
      : this.stakingCurrency;

    return isValidAmountAsset(stakingCurrency, this.stakingNetwork.network, this.fee ?? '0', '0');
  }

  get confirmBtnDisabled() {
    if (this.step === 4 || this.step === 5) return this.selectedValidatorsLength === 0 || this.fullMatchValidators;

    if (this.step === 6) return !this.isValidAmountAsset;

    return false;
  }

  get fullMatchValidators() {
    if (this.stakingNetwork.myValidators.length === 0) return false;

    return this.stakingNetwork.myValidators.every(({ address }) =>
      this.selectedValidators.some((_address) => address === _address)
    );
  }

  get buttontext() {
    if (this.step === 1) return 'common.edit';

    if (this.step === 4 || this.step === 5) {
      if (this.fullMatchValidators) return 'staking.validatorsAlreadyNominated';
    }

    if (this.step === 6 && !this.isValidAmountAsset)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.stakingAssetName.toUpperCase() } };

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
      from: this.accountsStore.selectedWallet.address,
      networkName: this.network,
      validators: this.selectedValidators,
    } as RequestNominate;
  }

  @Watch('selectedValidators')
  async srcWatcher() {
    this.fee = await getNominateNetworkFee({ validators: this.selectedValidators, network: this.network });
  }

  async mounted() {
    // TODO staking
    const isSlashed = false;
    const limitValidatorsIdentity = false;

    this.stakingNetwork.validators.forEach((info) => {
      Vue.set(this.state, info.address, {
        ...info,
        isSlashed,
        limitValidatorsIdentity,
        isSelect: false,
      });
    });

    if (this.stakingNetwork.isController) {
      const balances = await fetchBalance({
        address: this.stakingNetwork.stashAddress,
        networks: [this.stakingNetwork.network],
        walletEcosystem: WalletEcosystem.Substrate,
      });

      this.stashBalance = balances[0].balance;
    }
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) {
      this.stakingStore.getMyStakingInfo({ network: this.network });
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
