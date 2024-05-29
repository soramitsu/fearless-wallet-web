<template>
  <div class="algorithm-validator-disclaimer" data-testid="algorithmValidatorDisclaimer">
    <Icon icon="info-triangle" className="info-triangle" />

    <div class="paragraph">{{ $t('staking.warning1') }}</div>
    <div class="paragraph">{{ $t('staking.warning2') }}</div>
    <div class="paragraph">{{ $t('staking.warning3') }}</div>
  </div>
</template>

<style lang="scss" scoped>
.algorithm-validator-disclaimer {
  color: $grayish-white-2;
  text-align: left;
  display: flex;
  flex-direction: column;
  align-items: center;

  .info-triangle {
    margin-bottom: 10px;
    width: 42px;
    height: 42px;
  }

  .paragraph {
    line-height: 1.5;
    margin-top: 20px;
  }
}
</style>
