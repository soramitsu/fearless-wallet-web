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
        :address="selectedValidator"
        :stakingCurrency="stakingCurrency"
        :validators="validators"
      />

      <YourValidators v-else-if="step === 1" :validators="myValidators" @openValidatorInfo="openValidatorInfo" />

      <div v-else-if="step === 6">
        <FInput v-model="selectedAccountName" placeholder="accounts.account" size="big" :readonly="true" />

        <InfoRow
          text="staking.selectedValidators"
          :value="`${selectedQuantity} (${$t('common.max')} ${maxNominations})`"
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
        :border="false"
        :text="buttontext"
        @click="openSelectionValidatorsForm"
      />

      <ConfirmationPasswordPopup
        v-if="showConfirmationPasswordPopup"
        amount=""
        value=""
        :currency="stakingCurrency"
        :firstIcon="stakingAssetId"
        extrinsicType="staking"
        @close="confirmationPasswordPopupClose"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { StakingParams } from '@extension-base/services/staking-service/types';
import { myValidators } from './mock';
import type { NetworkName, SelectionValidator } from '@/interfaces';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';
import YourValidators from '@/screens/staking/myStake/validators/YourValidators.vue';
import ValidatorInfo from '@/screens/staking/myStake/validators/ValidatorInfo.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getStakingParams, getValidators } from '@/extension/messaging';

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
  validators: FWValidatorInfoFull[] = [];
  myValidators = myValidators;
  step = 1;
  isSuggested = false;
  selectedValidator = '';
  fee = '0';
  networkParams: Nullable<StakingParams> = null;

  @Prop({ type: String }) network!: NetworkName;
  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get selectedQuantity() {
    return Object.values(this.state).filter(({ isSelect }) => isSelect).length;
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
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get showConfirmButton() {
    return this.step !== 2 && !this.showValidatorInfo;
  }

  get buttontext() {
    if (this.step === 1) return 'common.edit';

    return 'common.confirm';
  }

  get showBackIcon() {
    return this.step !== 1 || this.showValidatorInfo;
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
    const maxNominations = this.networkParams?.maxNominations ?? 0;

    // Если количество валидаторов в сети меньше, чем maxNominations, то отображаем количество валидаторов как maxNominations
    if (this.validators.length < maxNominations) return this.validators.length;

    return maxNominations;
  }

  get showValidatorInfo() {
    return this.selectedValidator !== '';
  }

  async mounted() {
    this.validators = await getValidators({ networkName: this.network });
    const stakingParams = await getStakingParams([this.network]);

    this.networkParams = stakingParams[0];

    this.validators.forEach(({ address, apy, name, description }) => {
      Vue.set(this.state, address, {
        name,
        address,
        apy,
        description,
        isSelect: false,
      });
    });
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  openValidatorList(isSuggested: boolean) {
    this.validators = this.validators.map((validator, index) => {
      const isSelect = isSuggested && index < this.maxNominations; // валидаторы возвращаются от "лучшего" к "худшему", по этому берем первых в нужном количестве

      return { ...validator, isSelect };
    });

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

  openValidatorInfo(value: string) {
    this.selectedValidator = value;
  }

  handlerBack() {
    if (this.showValidatorInfo) {
      this.selectedValidator = '';

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
