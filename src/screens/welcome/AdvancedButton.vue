<template>
  <div class="advanced-button">
    <s-button class="button" type="link" border-radius="mini" @click="handler">
      <span>Advanced backup settings</span>
      <s-icon name="circle-plus-16" class="plus-icon" />
    </s-button>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop(Function) handler!: VoidFunction;
}
</script>

<style lang="scss"></style>

<style lang="scss" scoped>
.advanced-button {
  color: #ffffff;
  margin-top: 5px;

  .button {
    color: inherit;
    font-size: 16px;
    line-height: 170%;

    span {
      font-weight: 400;
    }

    &:hover {
      .s-icon-circle-plus-16 {
        color: var(--pink-color);
      }
    }
  }

  .plus-icon {
    width: 28px;
    height: 28px;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
  }

  i {
    color: white;
  }
}
</style>
