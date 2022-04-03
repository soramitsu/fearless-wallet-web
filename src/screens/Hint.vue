<template>
  <div class="hint">
    <div class="notifications-icon">
      <s-icon name="notifications-info-24" />
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
  margin-top: 15px;

  i {
    color: rgba(255, 255, 255, 0.65);
  }

  display: flex;
  font-size: 12px;
  text-align: left;

  .notifications-icon {
    width: 48px;
    height: 48px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .info-text {
    width: 490px;
    font-size: 14px;
    line-height: 19px;
    font-weight: 300;
    margin: auto 0;
  }
}
</style>
