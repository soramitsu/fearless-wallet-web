<template>
  <Popup
    :showHeader="false"
    :showBlur="false"
    :showBorder="true"
    :handlerClose="handlerClose"
    :top="top"
    :left="-17"
    verticalPlacement="center"
    horizontalPlacement="right"
  >
    <div class="node-settings">
      <div class="row" @click="$emit('openEditNodeForm')">
        <img src="@/assets/edit.svg" class="edit-icon" />
        <div class="label">Edit node</div>
      </div>
      <div class="row" @click="$emit('openNotificationPopup')">
        <img src="@/assets/basket.svg" class="basket-icon" />
        <div class="label delete">Delete node</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from '@/components/Popup.vue';

@Component({
  components: { Popup },
})
export default class NodeSettingsPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;

  get top() {
    return 0;
  }
}
</script>

<style lang="scss" scoped>
.node-settings {
  color: rgba(255, 255, 255, 0.75);
  font-weight: 500;

  .row {
    display: flex;
    margin: 0 0 20px 20px;

    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .edit-icon {
        filter: invert(0.1);
      }

      .basket-icon {
        filter: invert(0);
      }

      .delete {
        opacity: 1;
      }
    }

    .edit-icon {
      filter: invert(0.25);
    }

    .basket-icon {
      filter: invert(0.1);
    }

    .label {
      margin: auto 0 auto 10px;
      width: 160px;
      text-align: left;
    }

    .delete {
      color: $pink-color;
      opacity: 0.8;
    }
  }
}
</style>
