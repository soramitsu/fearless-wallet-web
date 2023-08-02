<template>
  <div>
    <Alert headerText="common.attention" message="staking.tokensAllocated" sizeText="small" class="alert" />

    <ContentForm :height="305" :isStaticHeight="true" :bottomRightCorner="true">
      <Scroll>
        <div class="form-layout">
          <div class="label">{{ $t('staking.elected') }}</div>

          <div class="sub-label">{{ $t('staking.stakeAllocated') }}</div>

          <ValidatorItem
            v-for="validator in withAllocationValidators"
            :key="validator.address"
            :validator="validator"
            :showCheckbox="false"
            @openValidatorInfo="$emit('openValidatorInfo', $event)"
          />

          <div class="sub-label">{{ $t('staking.withoutAllocation') }}</div>

          <template v-if="showWithoutAllocation">
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
import type { SelectionValidator } from '@/interfaces';
import ValidatorItem from '@/screens/staking/myStake/validators/ValidatorItem.vue';

@Component({
  components: {
    ValidatorItem,
  },
})
export default class YourValidators extends Vue {
  @Prop({ type: Array }) validators!: SelectionValidator[];

  get withAllocationValidators() {
    return this.validators;
  }

  get showWithoutAllocation() {
    return this.withoutAllocationValidators.length !== 0;
  }

  get withoutAllocationValidators() {
    return this.validators;
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
}

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

.alert {
  margin-bottom: 15px;
}
</style>
