<template>
  <div>
    <Alert
      v-if="showOversubscribedAlert"
      headerText="common.attention"
      message="staking.tokensAllocated"
      sizeText="small"
      class="alert"
    />

    <ContentForm :height="430" :bottomRightCorner="true">
      <Scroll>
        <div class="form-layout">
          <template v-if="showMyValidators">
            <div class="label" data-testid="electedLabel">{{ $t('staking.elected') }}</div>

            <template v-if="showMyActiveValidators">
              <div class="sub-label" data-testid="stakeAllocated">{{ $t('staking.stakeAllocated') }}</div>

              <ValidatorItem
                v-for="validator in myActiveValidators"
                :key="validator.address"
                :validator="validator"
                :showCheckbox="false"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </template>

            <template v-if="showInactiveMyValidators">
              <div class="sub-label" data-testid="withoutAllocation">{{ $t('staking.withoutAllocation') }}</div>

              <ValidatorItem
                v-for="validator in inactiveValidators"
                :key="validator.address"
                :validator="validator"
                :showCheckbox="false"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </template>

            <template v-if="showWaitingMyValidators">
              <div class="label" data-testid="notElectedLabel">{{ $t('staking.notElected') }}</div>

              <div class="sub-label" data-testid="waitingValidators">{{ $t('staking.waitingValidators') }}</div>

              <ValidatorItem
                v-for="validator in waitingValidators"
                :key="validator.address"
                :validator="validator"
                :showCheckbox="false"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </template>
          </template>

          <div v-else class="no-validators" data-testid="noValidators">{{ $t('staking.noValidators') }}</div>
        </div>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import ValidatorItem from '@/screens/staking/myStake/validators/ValidatorItem.vue';

export default defineComponent({ name: 'YourValidators',
  components: {
    ValidatorItem,
  },
  props: {
    stakingNetwork: { type: Object },
  },
  computed: {
    showMyValidators() {
      return this.stakingNetwork.myValidators.length !== 0;
    },
    myActiveValidators() {
      return this.stakingNetwork.myValidators.filter(({ isActive }) => isActive);
    },
    showMyActiveValidators() {
      return this.myActiveValidators.length !== 0;
    },
    inactiveValidators() {
      return this.stakingNetwork.myValidators.filter(({ isInactive }) => isInactive);
    },
    showInactiveMyValidators() {
      return this.inactiveValidators.length !== 0;
    },
    waitingValidators() {
      return this.stakingNetwork.myValidators.filter(({ isWaiting }) => isWaiting);
    },
    showWaitingMyValidators() {
      return this.waitingValidators.length !== 0;
    },
    showOversubscribedAlert() {
      return this.stakingNetwork.myValidators.some(({ isOversubscribed }) => isOversubscribed);
    },
  },
});
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
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }

  .sub-label {
    font-size: 0.75rem;
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
