<template>
  <div class="hint">
    <div class="notifications-icon">
      <s-icon :name="icon" />
    </div>
    <div class="info-text">
      {{ text }}
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';

type iconType = 'notification' | 'warning';
@Component({})
export default class extends Vue {
  @Prop(String) iconType!: iconType;
  @Prop(String) text!: string;

  get icon() {
    switch (this.iconType) {
      case 'notification':
        return 'notifications-info-24';
      case 'warning':
        return 'notifications-alert-triangle-24';
      default:
        return 'notifications-info-24';
    }
  }
}
</script>

<style lang="scss" scoped>
.hint {
  color: rgba(255, 255, 255, 0.65);

  i {
    color: rgba(255, 255, 255, 0.65);
  }

  display: flex;
  font-size: 12px;
  text-align: left;

  .notifications-icon {
    display: flex;
    align-items: center;
    margin-right: 15px;
  }

  .info-text {
    width: 491px;
    font-size: 14px;
    margin: auto 0;
    line-height: 14px;
  }
}
</style>
