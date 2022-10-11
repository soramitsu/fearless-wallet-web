<template>
  <SCol class="auth-content" width="100%" v-bind:key="request.id">
    <SRow>
      <SCol :span="9" class="s-flex s-justify-start">
        <span class="auth-item-name">{{ request.origin }}</span>
      </SCol>
      <SCol :span="3">
        <SRow flex justify="space-between">
          <span class="authorized-account__count" @click="$emit('updateAuths', stripUrl)">{{
            authorizedAccounts
          }}</span>
          <img class="trash" src="@/assets/trash.svg" @click="$emit('onRemoveAuth', prepUrl)" />
        </SRow>
      </SCol>
    </SRow>
    <SDivider class="divider" />
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
.divider {
  background-color: $default-background-color;
  margin: 17px 0;
}

.auth-item-name {
  font-size: 16px;
}

.auth-content {
  padding-top: 12px;
}

.img-button {
  background-image: url('@/assets/trash.svg');
  background-size: 16px 16px;
  height: 16px;
  width: 16px;
}

.authorized-account__count {
  cursor: pointer;
  white-space: nowrap;
  color: rgba(0, 238, 119, 1);
}

.trash {
  cursor: pointer;
}
</style>
