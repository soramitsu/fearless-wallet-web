<template>
  <div :class="classes" @click="click">
    <div class="left-part">
      <Checkbox
        v-if="showCheckbox"
        :value="validator.isSelect"
        size="medium"
        label=""
        class="validator-checkbox"
        data-testid="validatorCheckbox"
        @change="onSelect"
      />

      <Identicon :address="validator.address" class="ident" />

      <div data-testid="validatorName">{{ validator.name }}</div>
    </div>

    <div class="right-part">
      <div data-testid="validatorApy">{{ validator.apy }}%</div>

      <Icon icon="info" data-testid="validatorInfo" :class="iconClasses" />

      <Tooltip :text="validator.description" :target="`.${validator.address}`" placement="left" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { CustomEvent } from '@/interfaces';

export default defineComponent({ name: 'ValidatorItem' ,
  props: {
    validator: { type: Object },
    showCheckbox: { default: true },
  },
  computed: {
    iconClasses() {
      return ['icon-info', this.validator.address];
    },
    classes() {
      return ['validator', 'validator-cursor'];
    },
  },
  methods: {
    click(event: CustomEvent) {
      if (
            event.target?.classList.contains('el-checkbox__inner') ||
            event.target?.classList.contains('el-checkbox__original')
          )
            return;

          this.$emit('openValidatorInfo', this.validator);
    },
    onSelect(value: boolean) {
      this.$emit('onSelect', value, this.validator.address);
    },
  },
});
</script>

<style lang="scss" scoped>
.validator-cursor {
  cursor: pointer;
}

.validator {
  padding: 10px 0;
  border-bottom: $default-border;
  display: flex;
  justify-content: space-between;
  color: $default-white;
  width: 100%;

  .left-part {
    display: flex;
    align-items: center;

    .ident {
      margin: 0 10px;
    }

    .validator-checkbox {
      height: 36px;
    }
  }

  .right-part {
    display: flex;
    align-items: center;

    .icon-info {
      margin-left: 10px;
      width: 20px;
      height: 20px;
      cursor: pointer;
    }
  }
}
</style>
