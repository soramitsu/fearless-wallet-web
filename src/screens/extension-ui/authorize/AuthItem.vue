<template>
  <router-link :to="{ name: Components.UpdateAuths, params: { id: stripedUrl } }" v-slot="{ navigate }">
    <div class="auth-content" width="100%">
      <div class="row">
        <div class="row-content" @click="navigate">
          <div class="col">
            <ExternalLogo :name="faviconURl" alt="favicon" />

            <span class="auth-item-name">{{ stripedUrl }}</span>
          </div>

          <span class="authorized-account__count">{{ authAccounts }}</span>
        </div>

        <Icon className="trash row-controls" icon="trash" @click="onRemoveAuth" />
      </div>
    </div>
  </router-link>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import { Components } from '@/router/routes';

const { authorizedAccounts, url } = defineProps<{
  url: string;
  authorizedAccounts: string[];
}>();
const emits = defineEmits(['openUpdateAuths', 'remove']);

const stripedUrl = computed(() => stripUrl(url));

const faviconURl = computed(() => {
  const host = new URL(url).host;

  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
});

const authAccounts = computed(() => {
  const authListLength = authorizedAccounts.length;

  return `${authListLength} account${authListLength !== 1 ? 's' : ''}`;
});

const onRemoveAuth = () => emits('remove', stripedUrl.value);
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
