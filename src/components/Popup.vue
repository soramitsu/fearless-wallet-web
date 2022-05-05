<template>
  <div :class="popupBackgroundClasses">
    <div :class="popupContainerClasses">
      <div class="header">
        <SearchInput v-if="search" v-model="filterValue" placeholder="Search in networks" class="search" />

        <template v-else>
          <div class="button"></div>
          <div class="header-text">{{ header }}</div>
        </template>

        <s-button type="link" class="button" @click="handlerClose">
          <s-icon name="basic-close-24" />
        </s-button>
      </div>

      <Scroll>
        <div class="content">
          <slot></slot>
        </div>
      </Scroll>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import Scroll from './Scroll.vue';
import SearchInput from './SearchInput.vue';

type Placement = 'left' | 'center' | 'right';

@Component({
  components: { Scroll, SearchInput },
})
export default class extends Vue {
  filterValue = '';

  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerFilter!: (value: string) => void;
  @Prop({ default: '' }) header!: string;
  @Prop({ default: false }) search!: boolean;
  @Prop({ default: false }) staticHeight!: boolean;
  @Prop({ default: 'center' }) placement!: Placement;

  get popupContainerClasses() {
    return [
      'popup-container',
      `popup-container-placement-${this.placement}`,
      {
        'static-height': this.staticHeight,
      },
    ];
  }

  get popupBackgroundClasses() {
    return ['popup-background', `popup-background-placement-${this.placement}`];
  }

  @Watch('filterValue')
  filter(value: string) {
    this.handlerFilter(value);
  }
}
</script>

<style lang="scss" scoped>
.popup-background {
  height: var(--extension-height);
  width: var(--extension-width);
  border-radius: var(--default-border-radius);
  display: flex;
  position: absolute;
  top: 0;
  margin: auto;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
  z-index: 399;
  animation: opacity 0.7s;

  @keyframes opacity {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  .popup-container {
    display: flex;
    align-items: center;
    flex-direction: column;
    margin: auto 16px;
    min-height: 100px;
    min-width: 380px;
    max-height: 390px;
    max-width: 480px;
    background-color: #111111;
    clip-path: var(--default-clip-path-left-top-and-right-bottom);
    border-radius: var(--default-border-radius);
    padding: 20px 0 30px;
  }

  .static-height {
    height: 390px;
  }

  .content {
    width: 100%;
    height: 100%;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 25px;
    margin-bottom: 15px;
    padding-left: 16px;
    padding-right: 22px;

    .header-text {
      font-weight: 700;
      font-size: 18px;
      color: rgba(255, 255, 255, 0.75);
    }

    .search {
      width: 300px;
    }
  }

  .s-icon-basic-close-24 {
    color: rgba(255, 255, 255, 0.65);
  }

  .button {
    padding: 0;
    width: 20px;
  }
}

.popup-background-placement-left {
  justify-content: left;
}

.popup-background-placement-center {
  justify-content: center;
}

.popup-background-placement-right {
  justify-content: right;
}
</style>
