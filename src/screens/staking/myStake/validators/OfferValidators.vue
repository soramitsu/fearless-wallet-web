<template>
  <div class="offer-validators">
    <ContentForm :height="298" :isStaticHeight="true" :bottomRightCorner="true">
      <div class="content">
        <div class="label">{{ $t('staking.suggestedAlgorithm') }}</div>

        <div class="sub-label">{{ $t('staking.algorithmRecommended') }}</div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.profitable') }}
        </div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.oversubscribed') }}
        </div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.onchainIdentity') }}
        </div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.slashed') }}
        </div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.validatorsIdentity') }}
        </div>

        <Button
          width="100%"
          text="staking.suggested"
          :border="false"
          iconName="protection"
          class="protection-button"
          @click="openValidatorList(true)"
        />
      </div>
    </ContentForm>

    <ContentForm :height="179" :isStaticHeight="true" :bottomRightCorner="true" class="validators-form">
      <div class="content">
        <div class="label">{{ $t('staking.stakeYourValidators') }}</div>

        <div class="sub-label">{{ $t('staking.yourValidatorsDisclaimer') }}</div>

        <Button
          width="100%"
          text="staking.selectYourself"
          :border="false"
          iconName="filter"
          @click="openValidatorList"
        />
      </div>
    </ContentForm>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class OfferValidators extends Vue {
  openValidatorList(isSuggested = false) {
    this.$emit('openValidatorList', isSuggested);
  }
}
</script>

<style lang="scss" scoped>
.offer-validators {
  .content {
    padding: $default-padding;
    text-align: left;
    font-size: 14px;
    color: $grayish-white;

    .label {
      font-weight: 600;
      color: $default-white;
      font-size: 16px;
    }

    .sub-label {
      margin: 16px 0;
      width: 445px;
    }

    .row {
      margin-top: 10px;
      display: flex;

      .icon-check {
        width: 15px;
        height: 17px;
        margin-right: 10px;
        color: $success-color;
      }
    }

    .protection-button {
      margin-top: 16px;
    }
  }

  .validators-form {
    margin-top: 20px;
  }
}
</style>
