<template>
  <SCol class="auth-content" width="100%" v-bind:key="request.id">
    <SRow>
      <SCol :span="9" class="s-flex s-justify-start">
        <span class="auth-item-name">{{ request.origin }}</span>
      </SCol>

      <SCol :span="3">
        <SRow flex justify="space-between">
          <span class="authorized-account__count" @click="$emit('openUpdateAuths', stripUrl)">
            {{ authorizedAccounts }}
          </span>

          <Icon icon="trash" className="trash" @click="removeAuth" />
        </SRow>
      </SCol>
    </SRow>

    <SDivider class="divider" />
  </SCol>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { AuthUrlInfo } from '@extension-base/background/types';
import { Action } from 'vuex-class';
import { stripUrl } from '@/extension/background/extension-base/src/background/handlers/helpers';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import { TAction } from '@/interfaces';

@Component
export default class AuthItem extends Vue {
  @Prop(Object) request!: AuthUrlInfo;
  @Action(AuthActionTypes.DELETE_AUTH_CONNECTION) deleteAuthConnection!: TAction<string>;

  get stripUrl() {
    return stripUrl(this.request.url);
  }

  get authorizedAccounts() {
    const authListLength = this.request.authorizedAccounts.length;

    return `${authListLength} account${authListLength !== 1 ? 's' : ''}`;
  }

  removeAuth() {
    this.deleteAuthConnection(this.stripUrl);
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
  padding: 0 12px;
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
