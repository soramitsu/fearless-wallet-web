<template>
  <Popup
    sizeWidth="mini"
    :showHeader="false"
    :showBorder="true"
    @handlerClose="$emit('handlerClose')"
    :top="top"
    :left="-35"
    verticalPlacement="top"
    horizontalPlacement="right"
  >
    <div class="node-settings">
      <div class="row" @click="$emit('openEditNodeForm')">
        <Icon icon="edit" className="edit-icon" />

        <div class="label">{{ $t('accounts.editNode') }}</div>
      </div>
      <div class="row" @click="$emit('openNotificationPopup', 'delete')">
        <Icon icon="basket" className="basket-icon" />

        <div class="label delete">{{ $t('accounts.deleteNode') }}</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class NodeSettingsPopup extends Vue {
  @Prop(Number) buttonTopClick!: number;

  get top() {
    if (this.buttonTopClick < 300) {
      return this.buttonTopClick + 18;
    }

    return this.buttonTopClick - 110;
  }
}
</script>

<style lang="scss" scoped>
.node-settings {
  color: $default-white;
  font-weight: 500;
  height: 60px;

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
      width: 20px;
      height: 20px;
    }

    .basket-icon {
      filter: invert(0.1);
      width: 20px;
      height: 20px;
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
