<template>
  <AboveForm
    header="soraCard.title"
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :handlerBack="handlerBack"
    :closeHandler="closeHandler"
  >
    <div class="container">
      <ContentForm :height="mainContentFormHeight">
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

                    <div class="status-xor">
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
          </div>
        </Scroll>
      </ContentForm>

      <Button
        v-if="showGetXORButton"
        text="soraCard.getXOR"
        width="100%"
        size="big"
        fontSize="big"
        class="get-xor-button"
        @click="getXOR"
      />

      <div class="buttons">
        <Button
          text="soraCard.haveCard"
          width="49%"
          size="big"
          fontSize="big"
          type="secondary"
          :border="false"
          @click="haveCard"
        />

        <Button
          :text="textIssueCardButton"
          width="49%"
          size="big"
          fontSize="big"
          class="start-card-button"
          :type="typeStartCardButton"
          :border="false"
          @click="issueCard"
        />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';

@Component
export default class SoraCardBanner extends Vue {
  step = 1;

  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

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

  get showBackIcon() {
    return this.step !== 1;
  }

  get issuanceContentFormHeight() {
    return this.haveFreePassKYS ? 270 : 105;
  }

  get mainContentFormHeight() {
    return this.isValidXorBalance ? 430 : 356;
  }

  get showGetXORButton() {
    return this.haveFreePassKYS && !this.isValidXorBalance;
  }

  get cardIssuanceText() {
    const value = this.haveFreePassKYS ? 'soraCard.free' : '12 €';

    return this.$t(value);
  }

  get textIssueCardButton() {
    const value = this.isValidXorBalance && this.haveFreePassKYS ? 'soraCard.issueCardFree' : 'soraCard.issueCardFee';

    return this.$t(value);
  }

  get statusXORText() {
    if (this.isValidXorBalance) return this.$t('soraCard.haveXOR');

    // TODO mock
    const left = 3;
    const fiatValue = 123;

    return `${left} XOR (${this.fiatSymbol}${fiatValue}) ${this.$t('soraCard.leftXORForFreeCard')}`;
  }

  get typeStartCardButton() {
    return this.isValidXorBalance ? 'primary' : 'secondary';
  }

  get iconFreeCard() {
    if (!this.haveFreePassKYS) return 'exclamation';

    return this.isValidXorBalance ? 'check' : 'close';
  }

  get freeCardIcon() {
    return ['icon', `${this.isValidXorBalance ? 'check' : 'reject'}-icon`];
  }

  handlerBack() {
    this.step -= 1;
  }

  closeHandler() {
    if (window.history.length === 1) this.$router.push({ name: Components.Wallet });
    else this.$router.back();
  }

  getXOR() {
    // this.$router.push({
    //   name: Components.Asset,
    //   params: {
    //     network: 'test',
    //     assetId: '1',
    //   },
    // });
  }

  haveCard() {
    console.info('haveCard');
  }

  issueCard() {
    console.info('issueCard');
  }
}
</script>

<style scoped lang="scss">
.container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

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
        color: $pink-color;
      }
    }

    .free-card-form {
      margin-top: 10px;
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

  .get-xor-button {
    margin-top: 10px;
  }

  .buttons {
    display: flex;
    margin-top: 10px;

    .start-card-button {
      margin-left: 10px;
    }
  }
}
</style>
