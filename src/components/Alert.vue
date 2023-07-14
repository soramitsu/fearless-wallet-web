<template>
  <Corners :isError="true" size="big">
    <div class="alert-container">
      <div class="alert__content">
        <Hint class="alert__header" size="big" iconName="warning" :text="headerText" />

        <p :class="messageClasses">
          <slot>{{ $t(message) }}</slot>
        </p>
      </div>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

type SizeTextType = 'small' | 'medium' | 'big';

@Component
export default class Container extends Vue {
  @Prop(String) message!: string;
  @Prop({ default: 'medium' }) sizeText!: SizeTextType;
  @Prop({ default: 'common.attention' }) headerText!: string;

  get messageClasses() {
    const classes = ['alert__message'];
    if (this.sizeText !== 'medium') classes.push(`text-${this.sizeText}`);

    return classes;
  }
}
</script>

<style lang="scss" scoped>
.alert-container {
  background: $secondary-background-color;
  padding: $default-padding;
  border: 1px solid $simple-orange-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
}

.alert__content {
  width: 100%;
}

.alert__header {
  margin-bottom: 6px;
  font-size: $default-padding !important;
  line-height: 150%;
  color: $default-white !important;
}

.alert__message {
  font-weight: 400;
  line-height: 150%;
  color: $default-white;
  text-align: left;
}

.text-small {
  font-size: 14px;
}

.text-big {
  font-size: 18px;
}
</style>
