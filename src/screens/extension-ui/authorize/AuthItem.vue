<template>
  <div class="auth-content" width="100%" :key="request.id">
    <div class="row">
      <router-link class="row-content" :to="{ name: Components.UpdateAuths, params: { index: stripedUrl } }" tag="div">
        <div class="col">
          <ExternalLogo :name="faviconURl" alt="favicon" />

          <span class="auth-item-name">{{ request.origin }}</span>
        </div>

        <span class="authorized-account__count">{{ authorizedAccounts }}</span>
      </router-link>

      <Icon className="trash row-controls" icon="trash" @click="onRemoveAuth" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { AuthUrlInfo } from '@extension-base/background/types/types';
import { stripUrl } from '@extension-base/background/handlers/helpers';
// import type { CustomEvent } from '@/interfaces';
import { Components } from '@/router/routes';

const { request } = defineProps<{ request: AuthUrlInfo }>();

const emits = defineEmits(['openUpdateAuths', 'remove']);

const stripedUrl = computed(() => stripUrl(request.url));

const faviconURl = computed(() => {
  const host = new URL(request.url).host;

  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
});

const authorizedAccounts = computed(() => {
  const authListLength = request.authorizedAccounts.length;

  return `${authListLength} account${authListLength !== 1 ? 's' : ''}`;
});

const onRemoveAuth = () => emits('remove', stripedUrl.value);

// const onClick = (event: CustomEvent) => {
//   const classList = event.target?.classList;

//   if (!classList.contains('trash')) emits('openUpdateAuths', stripedUrl.value);
// };
</script>

<style lang="scss" scoped>
.divider {
  background-color: $default-background-color;
  margin: 17px 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;

  &-content {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
}
.auth-item-name {
  font-size: 16px;
}

.auth-content {
  cursor: pointer;
  padding: 16px 0;
  border-bottom: 1px solid $default-background-color;
}

.authorized-account__count {
  white-space: nowrap;
  color: rgba(0, 238, 119, 1);
}

.trash {
  height: 16px;
  width: 16px;
}
.icon-duck {
  display: inline-block;
  width: 24px;
  height: 24px;
}
.col {
  display: flex;
  align-items: center;
  gap: 5px;
}
</style>
