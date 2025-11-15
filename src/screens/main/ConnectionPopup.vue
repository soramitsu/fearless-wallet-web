<template>
  <Popup
    :showHeader="true"
    sizeWidth="big"
    :showBorder="true"
    :headerText="activeTabName"
    :closeByBackground="true"
    zIndex="299"
    @handlerClose="handleClose"
  >
    <div class="notification-popup-content">
      <div class="message">{{ message }}</div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { type ActiveTabAuthorizeStatus } from '@extension-base/background/types/types';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  tabStatus: ActiveTabAuthorizeStatus;
}>();

const emit = defineEmits<{
  handlerClose: [];
}>();

defineOptions({
  name: 'ConnectionPopup',
});

const { t, tc } = useI18n();

const message = computed(() => {
  if (props.tabStatus.isAuthorize) {
    const count = props.tabStatus.authorizeAccountsCount;
    const pluralization = count === 1 ? 1 : 2;

    return tc('header.connectedMessage', pluralization, { count });
  }

  return t('header.connectionStatusMessage', {
    not: props.tabStatus.isAuthorize ? '' : 'not',
  });
});

const activeTabName = computed(() =>
  props.tabStatus.dAppName === 'header.currentExtensionPage' ? t(props.tabStatus.dAppName) : props.tabStatus.dAppName
);

const handleClose = () => emit('handlerClose');
</script>

<style lang="scss" scoped>
.notification-popup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
}

.message {
  color: $gray-color;
  line-height: 150%;
  width: 300px;
}
</style>
