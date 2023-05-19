<template>
  <div>
    <ContentForm :height="430">
      <Scroll>
        <div :class="statusesClasses">
          <img :src="iconName" class="banner" alt="status card" />

          <div class="status">{{ $t(statusText) }}</div>
          <div class="status-description">{{ $t(statusDescription) }}</div>
          <div v-if="statusDescription2" class="status-description2">{{ $t(statusDescription2) }}</div>
        </div>
      </Scroll>
    </ContentForm>

    <div class="buttons">
      <Button
        text="common.close"
        width="49%"
        size="big"
        fontSize="big"
        type="secondary"
        class="close-btn"
        :border="false"
        @click="close"
      />

      <Button
        v-if="showSecondButton"
        :text="textRetryBtn"
        width="49%"
        size="big"
        fontSize="big"
        type="primary"
        class="retry-btn"
        :border="false"
        @click="retry"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import type { Fn } from '@/interfaces';
import UnsupportedCountries from '@/screens/soraCard/UnsupportedCountries.vue';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import { VerificationStatus } from '@/consts/soraCard';
import { Components } from '@/router/routes';
import { MutationTypes as SoraCardMutationTypes } from '@/store/soraCard/mutations';

@Component({
  components: { UnsupportedCountries },
})
export default class Status extends Vue {
  @Getter(SoraCardGettersTypes.hasFreeAttempts) hasFreeAttempts!: boolean;
  @Getter(SoraCardGettersTypes.currentStatus) currentStatus!: VerificationStatus;
  @Mutation(SoraCardMutationTypes.SET_WILL_TO_KYC_PASS_KYC_AGAIN) setWillToPassKycAgain!: Fn<boolean>;

  get isRejected() {
    return this.currentStatus === VerificationStatus.Rejected;
  }

  get isRejectedAndNotFreeAttempts() {
    return this.isRejected && this.hasFreeAttempts;
  }

  get statusesClasses() {
    return [
      'statuses',
      {
        'not-none': !this.isRejectedAndNotFreeAttempts,
      },
    ];
  }

  get iconName() {
    if (this.isRejectedAndNotFreeAttempts) return require('@/assets/icons/sora-card.png');

    return require(`@/assets/icons/sora-card-${this.currentStatus.toLowerCase()}.png`);
  }

  get statusText() {
    if (this.isRejectedAndNotFreeAttempts) return 'soraCard.statuses.noFreeAttempts.text1';

    return `soraCard.statuses.${this.currentStatus.toLowerCase()}.text1`;
  }

  get statusDescription() {
    if (this.isRejectedAndNotFreeAttempts) return 'soraCard.statuses.noFreeAttempts.text2';

    return `soraCard.statuses.${this.currentStatus.toLowerCase()}.text2`;
  }

  get statusDescription2() {
    if (this.isRejectedAndNotFreeAttempts) return 'soraCard.statuses.noFreeAttempts.text3';

    return `soraCard.statuses.${this.currentStatus.toLowerCase()}.text3`;
  }

  get showSecondButton() {
    return this.isRejected || this.isRejectedAndNotFreeAttempts;
  }

  get textRetryBtn() {
    return this.isRejected ? 'soraCard.tryAgain' : 'soraCard.support';
  }

  close() {
    if (window.history.length === 1) this.$router.push({ name: Components.Wallet });
    else this.$router.back();
  }

  retry() {
    if (this.isRejected) {
      this.setWillToPassKycAgain(true);
      this.$emit('openStartPage');
    } else alert('support'); // TODO
  }
}
</script>

<style scoped lang="scss">
.statuses {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;

  .banner {
    width: 497px;
    height: 298px;
  }

  .status {
    margin-top: 25px;
    font-weight: 700;
    font-size: 24px;
    width: 440px;
  }

  .status-description {
    margin: 12px 0;
    color: $default-white;
  }

  .status-description2 {
    color: $default-white;
  }
}

.not-none {
  padding: 5px 0 16px 16px;
}

.buttons {
  display: flex;
  margin-top: 10px;

  .close-btn {
    flex: 1;
  }

  .retry-btn {
    margin-left: 10px;
  }
}
</style>
