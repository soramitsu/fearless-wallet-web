<template>
  <div :class="nodeItemClasses" @click="changeNode">
    <div>
      <div class="name">{{ name }}</div>
      <div class="url">{{ url }}</div>
    </div>

    <CircleButton
      v-if="isCustomNode"
      iconName="dots-horizontal"
      backgroundColor="light-black"
      @click="$emit('openNodeSettings', name, url)"
    />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import CircleButton from '@/components/CircleButton.vue';

@Component({
  components: { CircleButton },
})
export default class NodeItem extends Vue {
  @Prop(String) name!: string;
  @Prop(String) url!: string;
  @Prop(Boolean) isActive!: boolean;
  @Prop(Boolean) isCustomNode!: boolean;
  @Prop(Boolean) isRemoveBorderBottom!: boolean;

  get nodeItemClasses() {
    return [
      'node-item',
      {
        'node-active': this.isActive,
        'not-border-bottom': this.isRemoveBorderBottom,
      },
    ];
  }

  changeNode(event: Event) {
    const classList = (event.target as any)?.classList;

    if (
      classList.contains('node-item') ||
      classList.contains('node-active') ||
      classList.contains('url') ||
      classList.contains('name')
    )
      this.$emit('changeNode', this.name, this.url);
  }
}
</script>

<style lang="scss" scoped>
.node-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;

  &:last-child {
    margin-bottom: 16px;
    border-bottom: none;
  }

  .url {
    font-weight: 400;
    font-size: 14px;
    text-align: left;
    margin-top: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 410px;
    color: #888888;
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
  border-radius: 8px;
  padding: 10px 20px;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-bottom: 1px solid #7700ee;

  .url {
    color: white;
  }
}
</style>
