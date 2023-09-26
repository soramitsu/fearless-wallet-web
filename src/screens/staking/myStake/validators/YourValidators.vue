<template>
  <div>
    <Alert
      v-if="showAlert"
      headerText="common.attention"
      message="staking.tokensAllocated"
      sizeText="small"
      class="alert"
    />

    <ContentForm :height="430" :bottomRightCorner="true">
      <Scroll>
        <div class="form-layout">
          <template v-if="showMyValidators">
            <div class="label">{{ $t('staking.elected') }}</div>

            <div class="sub-label">{{ $t('staking.stakeAllocated') }}</div>

            <ValidatorItem
              v-for="validator in myValidators"
              :key="validator.address"
              :validator="validator"
              :showCheckbox="false"
              @openValidatorInfo="$emit('openValidatorInfo', $event)"
            />
          </template>

          <div v-else class="no-validators">{{ $t('staking.noValidators') }}</div>

          <template v-if="showWithoutAllocation">
            <div class="sub-label">{{ $t('staking.withoutAllocation') }}</div>

            <ValidatorItem
              v-for="validator in withoutAllocationValidators"
              :key="validator.address"
              :validator="validator"
              :showCheckbox="false"
              @openValidatorInfo="$emit('openValidatorInfo', $event)"
            />
          </template>
        </div>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { NetworkParams } from '@/store';
import ValidatorItem from '@/screens/staking/myStake/validators/ValidatorItem.vue';

@Component({
  components: {
    ValidatorItem,
  },
})
export default class YourValidators extends Vue {
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;

  get myValidators() {
    return this.stakingNetwork.myValidators;
  }

  get showMyValidators() {
    return this.myValidators.length !== 0;
  }

  get withoutAllocationValidators() {
    // TODO staking
    return [];
  }

  get showWithoutAllocation() {
    return this.withoutAllocationValidators.length !== 0;
  }

  get showAlert() {
    // TODO staking
    return false;
  }
}
</script>

<style lang="scss" scoped>
.form-layout {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  height: 100%;
  padding: $default-padding;

  .label {
    font-weight: 600;
    text-align: left;
    color: $default-white;
  }

  .sub-label {
    font-size: 12px;
    text-align: left;
    color: $grayish-white-2;
    margin: 10px 0;
  }

  .no-validators {
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }
}

.alert {
  margin-bottom: 15px;
}
</style>
