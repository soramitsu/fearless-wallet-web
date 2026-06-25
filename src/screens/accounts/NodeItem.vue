<template>
  <div :class="nodeItemClasses" data-testid="nodeItem" @click="changeNode">
    <div>
      <div class="name" data-testid="nodeName">{{ name }}</div>
      <div class="url" data-testid="nodeUrl">{{ url }}</div>
    </div>

    <CircleButton
      v-if="isCustomNode"
      :ref="dotsHorizontalRef"
      iconName="dots-horizontal"
      backgroundColor="light-black"
      data-testid="nodeSettingsBtn"
      @click="openNodeSettingsPopup"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { CustomEvent } from '@/interfaces';

export default defineComponent({ name: 'NodeItem' ,
  props: {
    name: String,
    url: String,
    isActive: Boolean,
    isCustomNode: Boolean,
    isRemoveBorderBottom: Boolean,
  },
  data() {
    return {
      dotsHorizontalRef: 'dotsHorizontal',
    };
  },
  computed: {
    nodeItemClasses() {
      return [
            'node-item',
            {
              'node-active': this.isActive,
              'not-border-bottom': this.isRemoveBorderBottom,
            },
          ];
    },
  },
  methods: {
    changeNode(event: CustomEvent) {
      const classList = event.target?.classList;

          if (
            classList.contains('node-item') ||
            classList.contains('node-active') ||
            classList.contains('url') ||
            classList.contains('name')
          )
            this.$emit('changeNode');
    },
    openNodeSettingsPopup() {
      const targetElement = (this.$refs[this.dotsHorizontalRef] as { $el: HTMLElement })?.$el;
          const buttonTop = targetElement.getBoundingClientRect().top;

          targetElement.style.zIndex = '200';

          this.$emit('openNodeSettingsPopup', buttonTop, this.isActive);
    },
  },
});
</script>

<style lang="scss" scoped>
.node-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
  padding: 10px 20px;
  border-bottom: $default-border;
  box-sizing: border-box;

  &:last-child {
    border-bottom: none;
  }

  .url {
    font-weight: 400;
    font-size: 0.875em;
    text-align: left;
    width: 410px;
    height: 21px;
    line-height: 21px;
    color: #888888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    text-align: left;
  }

  &:hover {
    cursor: pointer;
  }
}

.not-border-bottom {
  border-bottom: none;
}

.node-active {
  background-color: #7700ee;
  border-radius: $default-border-radius;
  padding: 10px 20px;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-bottom: 1px solid #7700ee;

  .url {
    color: white;
  }
}
</style>
