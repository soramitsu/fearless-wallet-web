<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <Scroll>
      <div class="bond-form">
        <EditAddressBook
          v-if="showEditAddressBook"
          :network="network"
          :_address="newAddress"
          @setAddress="setAddress"
        />

        <HistoryBook
          v-else-if="showHistoryBook"
          :network="network"
          :assetId="stakingAssetId"
          @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
          @setRecipient="setPayoutAddress"
          @setAddress="setAddress"
        />

        <div v-else-if="showMyWallets">
          <WalletInfo
            v-for="({ name, address, ethereumAddress, isMobile }, index) in filteredWallets"
            :key="name + index"
            :name="name"
            :isSelected="getStatusWallet(address, ethereumAddress)"
            :isMobile="isMobile"
            :address="address"
            :showMenu="false"
            class="wallet"
            @setWallet="setWallet(address, ethereumAddress)"
          />
        </div>

        <div v-else>
          <template v-if="step === 1">
            <FInput v-model="accountName" placeholder="accounts.account" size="big" :readonly="true" />

            <SelectInput
              v-if="showAmountInput"
              class="amount-input"
              text="assets.amount"
              :totalAmount="transferableAmount"
              :value="amountValue"
              :asset="stakingAssetName"
              :assetId="stakingAssetId"
              :amount="amount"
              :showIcon="false"
              @update:amount="updateAmount"
              @setMax="setMax"
            />

            <Hint class="hint" iconName="notification" :text="textMinHint" />

            <InputWithIcon
              v-model="payoutAddressCut"
              icon="close"
              placeholder="staking.payoutAccount"
              @click="setPayoutAddress"
            />

            <Hint class="hint" iconName="notification" text="staking.defaultPayout" />

            <div class="activity-buttons">
              <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

              <BadgeButton text="common.paste" @click="paste" />

              <BadgeButton v-if="showMyWalletsButton" text="assets.myWallets" @click="toggleMyWalletsVisibility" />
            </div>

            <InfoRow
              text="assets.networkFee"
              borderType="default"
              icon="info"
              :value="`${feeMax} ${stakingAssetName}`"
              :price="feeMaxValueString"
              :iconClasses="['staking-fee']"
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

              <InfoRow text="assets.amount" :value="amountString" borderType="default" :price="amountValueString" />

              <InfoRow text="accounts.account" :value="selectedAccountName" borderType="default" />

              <InfoRow
                text="assets.networkFee"
                borderType="default"
                icon="info"
                :value="`${fee} ${stakingAssetName}`"
                :price="feeValueString"
                :isIconPrepend="false"
                :iconClasses="['staking-fee']"
              />
            </ContentForm>
          </template>

          <template v-if="step === 1 || step === 6">
            <Tooltip text="staking.stakingFee" target=".staking-fee" placement="right" />
          </template>

          <template v-if="step === 6">
            <div class="descriptions-row">
              <Icon icon="gift" class="icon" />

              <!-- TODO: staking Переделать, когда будут новые сети -->
              <div>
                {{ $t('staking.stakedTokens', { value: 6 + 'hours' }) }}
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
                {{ $t('staking.unstakingDisclaimers1') }}
              </div>
            </div>

            <div class="descriptions-row">
              <Icon icon="logout" class="icon" />

              <div>
                {{ $t('staking.unstakingDisclaimers2') }}
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
    </Scroll>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="amount"
      :value="amountValue"
      :fee="fee"
      :feeValue="feeValue"
      :firstIcon="stakingAssetId"
      :tx="tx"
      extrinsicType="bond"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { type RequestBond } from '@extension-base/services/staking-service/types';
import type { GetAssetPrice, SelectedWallet, NetworkParams } from '@/store';
import type { SelectionValidator } from '@/interfaces';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/validators/FiltersPopup.vue';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';
import { getNominateNetworkFee, getSoraFees } from '@/extension/messaging';
import { calcTransferableSendMinusFee, getUtilityAsset, isValidAmountAsset } from '@/helpers/currencies';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import BaseApi from '@/util/BaseApi';
import { cut, getClipboard } from '@/helpers';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import WalletInfo from '@/screens/main/WalletInfo.vue';

@Component({
  components: {
    WalletInfo,
    HistoryBook,
    FiltersPopup,
    SelectValidator,
    EditAddressBook,
    SelectionValidatorsForm,
    ConfirmationPasswordPopup,
  },
})
export default class Bond extends Vue {
  state: Record<string, SelectionValidator> = {};
  payoutAddress = '';
  step = 1;
  isSuggested = false;
  showConfirmationPasswordPopup = false;
  showHistoryBook = false;
  showMyWallets = false;
  fee = '';
  feeMax = '';
  amount = '';
  newAddress = '';

  @Prop({ type: Object }) networkParams!: NetworkParams;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];

  get showEditAddressBook() {
    return this.newAddress !== '';
  }

  get isValidPayoutAddress() {
    if (this.payoutAddress === '') return true;

    return BaseApi.validateAddress(this.payoutAddress, this.network);
  }

  get payoutAddressCut() {
    return cut(this.payoutAddress);
  }

  get showBtn() {
    return this.step !== 2 && !this.showHistoryBook && !this.showEditAddressBook;
  }

  get network() {
    return this.networkParams.network;
  }

  get stakingAssetId() {
    if (this.balances.length === 0) return '';

    const { groupId } = getUtilityAsset(this.balances, this.network);

    return groupId;
  }

  get stakingCurrency() {
    return this.balances.find(({ groupId }) => groupId === this.stakingAssetId);
  }

  get accountName() {
    return this.selectedWallet.name;
  }

  get filteredWallets() {
    return this.wallets.filter(({ active }) => !active);
  }

  get showMyWalletsButton() {
    return this.filteredWallets.length !== 0;
  }

  get stakingCurrencyBalance() {
    return this.stakingCurrency?.balances.find(({ name }) => name.toLowerCase() === this.network.toLowerCase());
  }

  get feeValue() {
    return getCostOfAssets(this.fee, this.stakingAssetPrice).toString();
  }

  get amountValue() {
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
    return this.step !== 1 || this.showMyWallets || this.showHistoryBook || this.showEditAddressBook;
  }

  get showSelectionValidatorsForm() {
    return this.step !== 1 && this.step !== 6;
  }

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get textMinHint() {
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

  get amountString() {
    return `${this.amount} ${this.stakingAssetName.toUpperCase()}`;
  }

  get amountValueString() {
    const value = +this.amount * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get feeMaxValueString() {
    const value = +this.feeMax * this.stakingAssetPrice;

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
      payoutAddress: this.payoutAddress,
      validators: this.selectedValidators,
    } as RequestBond;
  }

  get validators() {
    return Object.values(this.state);
  }

  @Watch('selectedValidators')
  async srcWatcher() {
    this.fee = await getNominateNetworkFee({ validators: this.selectedValidators, network: this.network });
  }

  mounted() {
    // TODO staking
    const isSlashed = false;
    const limitValidatorsIdentity = false;

    this.networkParams.validators.forEach(({ address, apy, name, description, isOversubscribed, isKnownGood }) => {
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
  }

  async getSoraFees() {
    // TODO: staking в сетях кроме соры, контроллер устанавливается отдельным вызовом, по этому нужно прибавлять и комиссию за StakingSetController
    const { StakingBond } = await getSoraFees();

    const feeMaxNominations = await getNominateNetworkFee({
      validators: new Array(this.networkParams.maxNominations),
      network: this.network,
    });

    this.feeMax = (+feeMaxNominations + +StakingBond).toString();
  }

  openValidatorList(isSuggested = false) {
    this.validators.forEach(
      (validator, index) => (this.state[validator.address].isSelect = isSuggested && index < this.maxNominations) // валидаторы возвращаются от "лучшего" к "худшему", по этому берем первых в нужном количестве
    );

    this.isSuggested = isSuggested;
    this.step = isSuggested ? 3 : 5;
  }

  updateAmount(amount: string) {
    this.amount = amount;
  }

  toggleHistoryBookVisibility() {
    this.showHistoryBook = !this.showHistoryBook;
  }

  updateSelectedValidators(value: boolean, address: string) {
    this.state[address].isSelect = value;
  }

  handlerBack() {
    if (this.step === 1) {
      this.showMyWallets = false;
      this.showHistoryBook = false;
      this.newAddress = '';

      return;
    }

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
    return calcTransferableSendMinusFee(this.stakingCurrency, this.network, this.feeMax);
  }

  setPayoutAddress(address = '') {
    this.payoutAddress = address;
  }

  async setMax() {
    if (!this.stakingCurrency) return;

    this.amount = this.calcTransferableSendMinusFee();
  }

  setAddress(address: string, showHistoryBook = false) {
    this.newAddress = address;
    this.showHistoryBook = showHistoryBook;
  }

  toggleMyWalletsVisibility() {
    this.showMyWallets = !this.showMyWallets;
  }

  getStatusWallet(address: string, ethereumAddress: string) {
    const currentAddress = BaseApi.formatAddress({ address, ethereumAddress }, this.network);
    const currentRecipientAddress = BaseApi.formatAddress(
      { address: this.payoutAddress, ethereumAddress: this.payoutAddress },
      this.network
    );

    return currentAddress === currentRecipientAddress;
  }

  setWallet(address: string, ethereumAddress: string) {
    this.payoutAddress = BaseApi.formatAddress({ address, ethereumAddress }, this.network);

    this.toggleMyWalletsVisibility();
  }
}
</script>

<style lang="scss" scoped>
.bond-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;

  .hint {
    padding: $default-padding;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 5px;
  }

  .amount-input {
    margin-top: 10px;
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

  .wallet {
    margin-bottom: 12px !important;
  }
}
</style>
