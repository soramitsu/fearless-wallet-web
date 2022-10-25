<template>
  <SCol class="auth__item" width="100%" v-bind:key="request.id">
    <SRow>
      <SCol :span="9" class="s-flex s-justify-start">
        <span class="auth__item-name">{{ request.origin }}</span>
      </SCol>
      <SCol :span="3">
        <SRow flex justify="space-between">
          <span class="auth__item-count" @click="$emit('updateAuths', stripUrl)">{{ authorizedAccounts }}</span>
          <img class="auth__item-delete" src="@/assets/trash.svg" @click="$emit('onRemoveAuth', prepUrl)" />
        </SRow>
      </SCol>
    </SRow>
    <SDivider class="auth__item-divider" />
  </SCol>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { AuthUrlInfo } from '@extension-base/background/types';
import { stripUrl } from '@/extension/background/extension-base/src/background/handlers/helpers';

@Component
export default class AuthItem extends Vue {
  @Prop(Object) request!: AuthUrlInfo;

  get prepUrl() {
    return stripUrl(this.request.url);
  }

  get stripUrl() {
    return this.request.url.split('/')[2];
  }

  get authorizedAccounts() {
    const authListLenght = this.request.authorizedAccounts.length;

    return authListLenght === 1 ? `1 account` : `${authListLenght} accounts`;
  }
}
</script>

<style lang="scss" scoped>
.auth__item-divider {
  background-color: $default-background-color;
  margin: 17px 0;
}

.auth__item-name {
  font-size: 16px;
}

.auth__item {
  padding-top: 12px;
}

.auth__item-count {
  cursor: pointer;
  white-space: nowrap;
  color: rgba(0, 238, 119, 1);
}

.auth__item-delete {
  cursor: pointer;
}
</style>
