<template>
  <div>
    <ContentForm :height="430">
      <Scroll>
        <div class="card-content">
          <img src="@/assets/icons/sora-card.png" class="banner" alt="sora card banner" />

          <div class="card-descriptions">{{ $t('soraCard.cardDescriptions') }}</div>
          <div class="card-get">{{ $t('soraCard.cardGet') }}</div>

          <ContentForm :height="65" :isStaticHeight="true" :bottomRightCorner="true">
            <div class="form-layout">
              <div>
                <Icon icon="check" class="icon check-icon" />

                <span class="bold">€ 0&nbsp;</span> {{ $t('soraCard.serviceFee') }}
              </div>
            </div>
          </ContentForm>

          <ContentForm
            :height="issuanceContentFormHeight"
            :isStaticHeight="true"
            :bottomRightCorner="true"
            class="free-card-form"
          >
            <div class="form-layout">
              <template v-if="networkIsReady">
                <div class="free-card-status">
                  <Icon :icon="iconFreeCard" :class="freeCardIcon" />

                  <span class="bold">{{ cardIssuanceText }}&nbsp;</span>
                  {{ $t('soraCard.cardIssuance') }}
                </div>

                <ContentForm
                  v-if="haveFreePass"
                  :height="175"
                  :isStaticHeight="true"
                  :bottomRightCorner="true"
                  backgroundColor="black"
                >
                  <div class="form-layout hold-layout">
                    <div>
                      {{ $t('soraCard.hold€100') }}
                    </div>

                    <ProgressBar :fillFactor="fillFactorBar" class="progress-bar" />

                    <div :class="classesStatusXOR">
                      {{ statusXORText }}
                    </div>

                    <div class="application-fee">
                      {{ $t('soraCard.applicationFee') }}
                    </div>
                  </div>
                </ContentForm>

                <div v-else>
                  {{ $t('soraCard.noHaveFreeTry') }}
                </div>
              </template>

              <Loader v-else />
            </div>
          </ContentForm>

          <div class="residents-countries">{{ $t('soraCard.residentsCountries') }}</div>
          <div class="show-list" @click="$emit('toggleCountriesFormVisibility')">{{ $t('soraCard.seeList') }}</div>
        </div>
      </Scroll>
    </ContentForm>

    <div class="buttons">
      <FButton
        v-if="!isExtension"
        text="soraCard.haveCard"
        width="49%"
        size="big"
        fontSize="big"
        type="secondary"
        class="have-card-button"
        :border="false"
        @click="haveCard"
      />

      <FButton
        :text="textIssueCardButton"
        :width="widthProceedBtn"
        size="big"
        fontSize="big"
        type="primary"
        :border="false"
        :disabled="!networkIsReady"
        @click="proceed"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { NETWORK_STATUS } from '@extension-base//api/types/networks';
import { type FPNumber } from '@sora-substrate/util';
import UnsupportedCountries from '@/screens/soraCard/UnsupportedCountries.vue';
import { soraCardController } from '@/controllers';
import { IS_EXTENSION } from '@/consts/global';
import { calculateXorRestPrice, calculateXOREuroBalance, isValidEuroBalanceXor } from '@/util/soraCard';
import { getXORCurrency } from '@/helpers/currencies';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { useSoraCardStore } from '@/stores/soraCard';

@Component({
  components: { UnsupportedCountries },
})
export default class Preview extends Vue {
  readonly isExtension = IS_EXTENSION;
  readonly soraNetworkName = SORA_NETWORK_NAME;

  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  soraCardStore = useSoraCardStore();

  get networkIsReady() {
    const network = this.networksStore.getNetwork(this.soraNetworkName);

    return network?.networkStatus === NETWORK_STATUS.CONNECTED;
  }

  get fillFactorBar() {
    if (this.isValidEuroBalanceXor) return 1;

    return this.euroBalanceXOR / 100;
  }

  get widthProceedBtn() {
    return this.isExtension ? '100%' : '49%';
  }

  get haveFreePass() {
    if (this.soraCardStore.hasFreeAttempts == null) return true;

    return this.soraCardStore.hasFreeAttempts;
  }

  get currencyXOR() {
    return getXORCurrency(this.accountsStore.balances);
  }

  get isValidEuroBalanceXor() {
    return isValidEuroBalanceXor(this.euroBalanceXOR) ?? false;
  }

  get euroBalanceXOR() {
    if (!this.currencyXOR) return 0;

    return calculateXOREuroBalance(this.currencyXOR, this.soraCardStore.xorPerEuroRatio as FPNumber) ?? 0;
  }

  get restPriceXOR() {
    if (!this.currencyXOR)
      return {
        euroToPay: '0',
        euroToPayInXor: '0',
      };

    return calculateXorRestPrice(this.currencyXOR, this.soraCardStore.xorPerEuroRatio as FPNumber);
  }

  get classesStatusXOR() {
    return ['status-xor', this.isValidEuroBalanceXor ? 'status-xor-success' : 'status-xor-reject '];
  }

  get issuanceContentFormHeight() {
    return this.haveFreePass ? 270 : 105;
  }

  get cardIssuanceText() {
    const value = this.haveFreePass ? 'soraCard.free' : '12 €';

    return this.$t(value);
  }

  get statusXORText() {
    if (this.isValidEuroBalanceXor) return this.$t('soraCard.haveXORForFreeCard');

    const euroToPay = +(this.restPriceXOR?.euroToPay ?? 0);
    const euroToPayInXor = +(this.restPriceXOR?.euroToPayInXor ?? 0);
    const euro = euroToPay > 100 ? 100 : euroToPay;

    return `${this.$n(euroToPayInXor, 'decimal')} XOR (${this.accountsStore.fiatSymbol}${this.$n(
      euro,
      'price'
    )}) ${this.$t('soraCard.leftXORForFreeCard')}`;
  }

  get iconFreeCard() {
    if (!this.haveFreePass) return 'exclamation';

    return this.isValidEuroBalanceXor ? 'check' : 'close';
  }

  get freeCardIcon() {
    return ['icon', `${this.isValidEuroBalanceXor ? 'check' : 'reject'}-icon`];
  }

  get textIssueCardButton() {
    return (this.isValidEuroBalanceXor && this.haveFreePass) || !this.networkIsReady
      ? 'common.continue'
      : 'soraCard.getXOR';
  }

  async created() {
    this.soraCardStore.getXorPerEuroRatio();
  }

  @Watch('currencyXOR')
  currencyXORWatcher() {
    this.soraCardStore.getXorPerEuroRatio();
  }

  haveCard() {
    soraCardController.clearTokensFromLocalStorage();

    this.$emit('confirmApply', true);
  }

  proceed() {
    if (this.isValidEuroBalanceXor) this.$emit('confirmApply');
    else this.$emit('openGetXORPopup');
  }
}
</script>

<style scoped lang="scss">
.card-content {
  padding: 16px;

  .banner {
    width: 497px;
    height: 298px;
  }

  .card-descriptions {
    margin-top: 25px;
    font-weight: 700;
    font-size: 1.125em;
  }

  .card-get {
    margin: 12px 0 25px;
    color: $default-white;
  }

  .bold {
    font-weight: 800;
  }

  .form-layout {
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    align-items: center;
    height: 100%;
    padding: $default-padding;

    .icon {
      width: 15px;
      height: 17px;
      margin-right: 5px;
    }

    .check-icon {
      color: $success-color;
    }

    .reject-icon {
      color: $orange-color;
    }

    .free-card-status {
      margin-bottom: 15px;
    }

    .status-xor {
      font-weight: 600;
    }

    .status-xor-reject {
      color: $pink-color;
    }

    .status-xor-success {
      color: $success-color;
    }
  }

  .free-card-form {
    margin-top: 10px;
  }

  .residents-countries {
    margin-top: 32px;
    color: $default-white;
  }

  .show-list {
    color: $pink-lavender-color;
    text-decoration: underline;
    cursor: pointer;
    margin: 5px 0 16px;
  }
}

.hold-layout {
  padding: 20px 38px !important;
  color: $default-white;

  .progress-bar {
    margin: 16px 0 8px 0;
  }

  .application-fee {
    margin-top: 10px;
  }
}

.buttons {
  display: flex;
  margin-top: 10px;

  .have-card-button {
    margin-right: 10px;
  }
}
</style>
