<template>
  <div>
    <Alert
      v-if="showOversubscribedAlert"
      headerText="common.attention"
      message="staking.tokensAllocated"
      sizeText="small"
      class="alert"
    />

    <ContentForm
      v-if="showElectedValidators"
      :height="405"
      :isStaticHeight="showWaitingMyValidators"
      :bottomRightCorner="true"
    >
      <Scroll>
        <div class="form-layout">
          <template v-if="showMyValidators">
            <div class="label">{{ $t('staking.elected') }}</div>

            <template v-if="showMyActiveValidators">
              <div class="sub-label">{{ $t('staking.stakeAllocated') }}</div>

              <ValidatorItem
                v-for="validator in myActiveValidators"
                :key="validator.address"
                :validator="validator"
                :showCheckbox="false"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </template>

            <template v-if="showInactiveMyValidators">
              <div class="sub-label">{{ $t('staking.withoutAllocation') }}</div>

              <ValidatorItem
                v-for="validator in inactiveValidators"
                :key="validator.address"
                :validator="validator"
                :showCheckbox="false"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </template>
          </template>

          <div v-else class="no-validators">{{ $t('staking.noValidators') }}</div>
        </div>
      </Scroll>
    </ContentForm>

    <ContentForm
      v-if="showWaitingMyValidators"
      :height="405"
      :isStaticHeight="true"
      :bottomRightCorner="true"
      class="form-waiting"
    >
      <Scroll>
        <div class="form-layout">
          <div class="label">{{ $t('staking.notElected') }}</div>

          <div class="sub-label">{{ $t('staking.waitingValidators') }}</div>

          <ValidatorItem
            v-for="validator in waitingValidators"
            :key="validator.address"
            :validator="validator"
            :showCheckbox="false"
            @openValidatorInfo="$emit('openValidatorInfo', $event)"
          />
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

  get showMyValidators() {
    return this.stakingNetwork.myValidators.length !== 0;
  }

  get myActiveValidators() {
    return this.stakingNetwork.myValidators.filter(({ isActive }) => isActive);
  }

  get showMyActiveValidators() {
    return this.myActiveValidators.length !== 0;
  }

  get inactiveValidators() {
    return this.stakingNetwork.myValidators.filter(({ isInactive }) => isInactive);
  }

  get showInactiveMyValidators() {
    return this.inactiveValidators.length !== 0;
  }

  get waitingValidators() {
    return this.stakingNetwork.myValidators.filter(({ isWaiting }) => isWaiting);
  }

  get showElectedValidators() {
    return this.myActiveValidators.length !== 0 || this.inactiveValidators.length !== 0;
  }

  get showWaitingMyValidators() {
    return this.waitingValidators.length !== 0;
  }

  get showOversubscribedAlert() {
    return this.stakingNetwork.myValidators.some(({ isOversubscribed }) => isOversubscribed);
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

.form-waiting {
  margin-top: 10px;
}
</style>
