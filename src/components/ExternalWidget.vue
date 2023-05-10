<template>
  <div :class="containerClasses">
    <Loader v-if="widgetLoading" />

    <iframe v-show="showFrame" :src="src" title="External Widget" class="widget" @load="onLoadWidget" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';

type BackgroundColor = 'polkaswap' | 'default';

@Component
export default class ExternalWidget extends Vue {
  widgetLoading = true;

  @Prop({ default: '', type: String }) readonly src!: string;
  @Prop({ default: false, type: Boolean }) readonly withBorder!: boolean;
  @Prop({ default: 'default' }) readonly backgroundColor!: BackgroundColor;

  get showFrame() {
    return this.src && !this.widgetLoading;
  }

  get containerClasses() {
    const backgroundColor = `background-${this.backgroundColor}`;

    return [
      'widget-container',
      {
        'container-border': this.withBorder,
        [backgroundColor]: !this.widgetLoading,
      },
    ];
  }

  @Watch('src')
  srcWatcher(value: string) {
    if (value) this.widgetLoading = true;
  }

  onLoadWidget(): void {
    this.widgetLoading = false;
  }
}
</script>

<style lang="scss" scoped>
.widget-container {
  display: flex;
  justify-content: center;
  align-content: center;
  border: none;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 10px;
  border-radius: 10px;
  background-color: #111111;

  .widget {
    flex: 1;
    border: none;
  }

  .container-border {
    padding: 8px 4px;
    margin: 4px;
  }
}

.background-default {
  background-color: #111111;
}

.background-polkaswap {
  background-color: #fdf7fb;
}
</style>
