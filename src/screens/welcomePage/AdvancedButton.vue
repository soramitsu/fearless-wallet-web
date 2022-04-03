<template>
  <div class="advanced-button">
    <s-button class="button" type="link" border-radius="mini" @click="handler">
      Advanced
      <s-icon name="circle-plus-16" class="plus-icon" />
    </s-button>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class extends Vue {
  @Prop(Function) handler!: () => void;
}
</script>

<style lang="scss" scoped>
.advanced-button {
  color: #ffffff;

  .button {
    color: #ffffff;
    font-size: 16px;
    height: auto;
    padding-bottom: 12px;
    padding-top: 20px;

    &:hover {
      .s-icon-circle-plus-16 {
        color: #ee0077;
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
