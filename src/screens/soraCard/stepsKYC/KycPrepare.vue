<template>
  <div class="kyc-prepare">
    <div>
      <Alert headerText="common.attention" message="soraCard.prepareAttention" sizeText="small" />

      <div class="prepare-label">{{ $t('soraCard.prepare') }}</div>

      <div class="step">
        <div class="step-circle">1</div>

        <div>
          <div>{{ $t('soraCard.prepareSteps.step1') }}</div>
          <div class="description">{{ $t('soraCard.prepareSteps.stepDescription1') }}</div>
        </div>
      </div>

      <div class="step">
        <div class="step-circle">2</div>

        <div>
          <div>{{ $t('soraCard.prepareSteps.step2') }}</div>
          <div class="description">{{ $t('soraCard.prepareSteps.stepDescription2') }}</div>
        </div>
      </div>

      <div class="step">
        <div class="step-circle">3</div>

        <div>
          <div>{{ $t('soraCard.prepareSteps.step3') }}</div>
          <div class="description">{{ $t('soraCard.prepareSteps.stepDescription3') }}</div>
        </div>
      </div>

      <div class="step">
        <div class="step-circle">4</div>

        <div>
          <div>{{ $t('soraCard.prepareSteps.step4') }}</div>
          <div class="description">{{ $t('soraCard.prepareSteps.stepDescription4') }}</div>
        </div>
      </div>
    </div>

    <FButton
      text="common.iAmReady"
      width="100%"
      size="big"
      fontSize="big"
      :border="false"
      @click="$emit('openKycVieW')"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({
  components: {},
})
export default class KycPrepare extends Vue {}
</script>

<style scoped lang="scss">
.kyc-prepare {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-weight: 600;
  font-size: 1em;
  line-height: 20px;
  color: $default-white;
  text-align: left;
  height: 100%;

  .prepare-label {
    margin-top: 16px;
  }

  .step {
    margin-top: 16px;
    display: flex;

    .step-circle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 43px;
      height: 43px;
      min-width: 43px;
      border-radius: 23px;
      padding: 10px;
      background: $default-background-color;
      margin-right: 16px;
    }

    .description {
      color: $grayish-white;
      margin-top: 6px;
      font-size: 0.875em;
    }
  }
}
</style>
