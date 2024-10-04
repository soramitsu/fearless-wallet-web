<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    :showHeader="false"
    :showBorder="true"
    :top="top"
    :left="-35"
    :zIndex="399"
    @handlerClose="$emit('handlerClose')"
  >
    <div class="node-settings">
      <div class="row" @click="$emit('openEditNodeForm', selectedNetwork, name, url)">
        <Icon icon="edit" className="edit-icon" />

        <div class="label" data-testid="editNode">{{ $t('accounts.editNode') }}</div>
      </div>
      <div class="row" @click="$emit('openNotificationPopup')">
        <Icon icon="basket" className="basket-icon" />

        <div class="label delete" data-testid="deleteNode">{{ $t('accounts.deleteNode') }}</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router/composables';

type Props = { buttonTopClick: number; name?: string; url?: string };
const props = defineProps<Props>();
const route = useRoute();

const selectedNetwork = computed(() => route.params.network);
const top = computed(() => {
  const computedMargin = props.buttonTopClick < 300 ? 18 : -100;

  return props.buttonTopClick + computedMargin;
});
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
