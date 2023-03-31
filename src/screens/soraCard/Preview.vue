<template>
  <div>
    <ContentForm :height="430">
      <Scroll>
        <div class="card-content">
          <Icon icon="sora-card" class="banner" />

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
              <div class="free-card-status">
                <Icon :icon="iconFreeCard" :class="freeCardIcon" />

                <span class="bold">{{ cardIssuanceText }}&nbsp;</span>
                {{ $t('soraCard.cardIssuance') }}
              </div>

              <ContentForm
                v-if="haveFreePassKYS"
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
            </div>
          </ContentForm>

          <div class="residents-countries">{{ $t('soraCard.residentsCountries') }}</div>
          <div class="show-list" @click="$emit('toggleCountriesFormVisibility')">{{ $t('soraCard.seeList') }}</div>
        </div>
      </Scroll>
    </ContentForm>

    <div class="buttons">
      <Button
        text="soraCard.haveCard"
        width="49%"
        size="big"
        fontSize="big"
        type="secondary"
        class="have-card-button"
        :border="false"
        @click="haveCard"
      />

      <Button
        :text="textIssueCardButton"
        width="49%"
        size="big"
        fontSize="big"
        type="primary"
        :border="false"
        @click="proceed"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currencies } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID, SORA_UTILITY_ASSET } from '@/consts/networks';
import KYC from '@/screens/soraCard/KYC.vue';
import UnsupportedCountries from '@/screens/soraCard/UnsupportedCountries.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({
  components: {
    KYC,
    UnsupportedCountries,
  },
})
export default class Preview extends Vue {
  @Prop(String) leftXORAmount!: string;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;

  // TODO mock
  get fillFactorBar() {
    if (this.isValidXorBalance) return 1;

    return 0.7;
  }

  // TODO mock
  get isValidXorBalance() {
    return false;
  }

  // TODO mock
  get haveFreePassKYS() {
    return true;
  }

  get selectedNetwork() {
    return SORA_NETWORK_NAME as string;
  }

  get classesStatusXOR() {
    return ['status-xor', this.isValidXorBalance ? 'status-xor-success' : 'status-xor-reject '];
  }

  get issuanceContentFormHeight() {
    return this.haveFreePassKYS ? 270 : 105;
  }

  get cardIssuanceText() {
    const value = this.haveFreePassKYS ? 'soraCard.free' : '12 €';

    return this.$t(value);
  }

  get currencyXOR() {
    return this.currencies.find(({ displayName, relayChain }) => {
      return displayName === SORA_UTILITY_ASSET && relayChain === this.selectedNetwork;
    });
  }

  get statusXORText() {
    if (this.isValidXorBalance) return this.$t('soraCard.haveXORForFreeCard');

    const fiatValue = this.currencyXOR?.getCostOfAssets(this.leftXORAmount);

    return `${this.leftXORAmount} XOR (${this.fiatSymbol}${fiatValue}) ${this.$t('soraCard.leftXORForFreeCard')}`;
  }

  get iconFreeCard() {
    if (!this.haveFreePassKYS) return 'exclamation';

    return this.isValidXorBalance ? 'check' : 'close';
  }

  get freeCardIcon() {
    return ['icon', `${this.isValidXorBalance ? 'check' : 'reject'}-icon`];
  }

  get textIssueCardButton() {
    const value = this.isValidXorBalance && this.haveFreePassKYS ? 'common.continue' : 'soraCard.getXOR';

    return this.$t(value);
  }

  getXOR() {
    this.$router.push({
      name: Components.Asset,
      params: {
        network: SORA_NETWORK_NAME,
        assetId: SORA_XOR_ASSET_ID,
      },
    });
  }

  haveCard() {
    console.info('haveCard');
  }

  proceed() {
    if (this.isValidXorBalance) this.$emit('proceed');
    else {
      this.$emit('openGetXORPopup');
    }
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
    font-size: 18px;
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
    padding: 16px;

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
