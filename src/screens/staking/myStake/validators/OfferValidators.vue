<template>
  <div class="offer-validators" data-testid="offerValidators">
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

          {{ $t('staking.notOversubscribed') }}
        </div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.onchainIdentity') }}
        </div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.notSlashed') }}
        </div>

        <div class="row">
          <Icon icon="check" class="icon-check" />

          {{ $t('staking.validatorsIdentity') }}
        </div>

        <FButton
          width="100%"
          text="staking.suggested"
          :border="false"
          iconName="protection"
          class="protection-button"
          data-testid="selectSuggestedBtn"
          @click="openValidatorList(true)"
        />
      </div>
    </ContentForm>

    <ContentForm :height="179" :isStaticHeight="true" :bottomRightCorner="true" class="validators-form">
      <div class="content">
        <div class="label">{{ $t('staking.stakeYourValidators') }}</div>

        <div class="sub-label">{{ $t('staking.yourValidatorsDisclaimer') }}</div>

        <FButton
          width="100%"
          text="staking.yourself"
          :border="false"
          iconName="filter"
          data-testid="selectByYourselfBtn"
          @click="openValidatorList"
        />
      </div>
    </ContentForm>
  </div>
</template>

<script lang="ts" setup>
const emit = defineEmits(['openValidatorList']);

const openValidatorList = (isSuggested: boolean) => emit('openValidatorList', isSuggested);
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
