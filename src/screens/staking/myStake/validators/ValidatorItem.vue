<template>
  <div :class="classes" @click="click">
    <div class="left-part">
      <Checkbox
        v-if="showCheckbox"
        :value="validator.isSelect"
        size="medium"
        label=""
        class="validator-checkbox"
        @change="onSelect"
      />

      <Identicon :address="validator.address" class="ident" />

      <div>{{ validator.name }}</div>
    </div>

    <div class="right-part">
      <div>{{ validator.apy }}%</div>

      <Icon icon="info" :class="iconClasses" />

      <Tooltip :text="validator.description" :target="`.${validator.address}`" placement="left" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { SelectionValidator } from '@/interfaces';

@Component
export default class ValidatorItem extends Vue {
  @Prop({ type: Object }) validator!: SelectionValidator;
  @Prop({ default: true }) showCheckbox!: boolean;

  get iconClasses() {
    return ['icon-info', this.validator.address];
  }

  get classes() {
    return [
      'validator',
      {
        'validator-cursor': !this.showCheckbox,
      },
    ];
  }

  click() {
    if (!this.showCheckbox) this.$emit('openValidatorInfo', this.validator);
  }

  onSelect(value: boolean) {
    this.$emit('onSelect', value, this.validator.address);
  }
}
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
