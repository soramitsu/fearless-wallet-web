<template>
  <div class="row" @click="$emit('onOpen')">
    <div class="description">
      <Icon :icon="icon" :className="iconClass" />

      <div class="label">{{ title }}</div>
    </div>

    <Icon icon="chevron-right" :className="['chevron-right']" />
  </div>
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
@Component
export default class SettingsMenuItem extends Vue {
  @Prop(String) icon!: string;
  @Prop(String) title!: string;
  readonly iconClass = ['icon', 'icon--width'];
  get getIconPath() {
    return require(`@/assets/${this.icon}.svg`);
  }
}
</script>

<style lang="scss" scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 20px 28px 20px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    cursor: pointer;
    color: rgba(255, 255, 255, 0.9);

    .icon {
      filter: invert(0.1);
    }
    .chevron-right {
      filter: invert(0.25);
    }
  }

  .icon {
    filter: invert(0.25);
  }

  .icon--width {
    width: 25px;
    height: 25px;
  }

  .chevron-right {
    filter: invert(0.5);
  }

  .description {
    display: flex;
  }

  .label {
    margin: auto 0 auto 10px;
    text-align: left;
  }
}
</style>
