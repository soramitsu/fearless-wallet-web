<template>
  <SCol width="100%" v-bind:key="request.id">
    <SRow>
      <SCol :span="9" class="s-flex s-justify-start">
        <span class="auth-item-name">{{ request.origin }}</span>
      </SCol>
      <SCol :span="3">
        <SRow flex justify="space-around">
          <span class="authorized-account__count" @click="$emit('updateAuths', request.origin)">{{
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
import { stripUrl } from '@extension-base/background/handlers/helpers';
import { AuthUrlInfo } from '@extension-base/background/types';

@Component
export default class AuthItem extends Vue {
  @Prop(Object) request!: AuthUrlInfo;

  get prepUrl() {
    return stripUrl(this.request.url);
  }

  get authorizedAccounts() {
    const authListLenght = this.request.authorizedAccounts.length;

    if (!authListLenght) return `no accounts`;
    if (authListLenght === 1) return `1 account`;

    return `${authListLenght} accounts`;
  }
}
</script>

<style lang="scss" scoped>
.divider {
  background-color: rgba(255, 255, 255, 0.1);
  margin: 17px 0;
}

.auth-item-name {
  font-size: 16px;
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
