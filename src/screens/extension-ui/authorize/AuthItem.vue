<template>
  <SCol class="auth-content" width="100%" v-bind:key="request.id" @click.native="onClick">
    <div class="row">
      <SCol :span="9" class="col">
        <ExternalLogo :name="faviconURl" alt="favicon" />
        <span class="auth-item-name">{{ request.origin }}</span>
      </SCol>

      <SCol :span="3">
        <SRow flex justify="space-between">
          <span class="authorized-account__count">
            {{ authorizedAccounts }}
          </span>

          <Icon icon="trash" className="trash" @click="removeAuth" />
        </SRow>
      </SCol>
    </div>
  </SCol>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { Action } from 'vuex-class';
import { AuthUrlInfo } from '@extension-base/background/types/types';
import type { AsyncFn, CustomEvent } from '@/interfaces';
import { stripUrl } from '@/extension/background/extension-base/src/background/handlers/helpers';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';

@Component
export default class AuthItem extends Vue {
  @Prop(Object) request!: AuthUrlInfo;
  @Action(ExtensionActionTypes.DELETE_AUTH_CONNECTION) deleteAuthConnection!: AsyncFn<string>;

  get stripUrl() {
    return stripUrl(this.request.url);
  }
  get faviconURl() {
    const url = new URL(this.request.url);

    return `https://icons.duckduckgo.com/ip3/${url.host}.ico`;
  }
  get authorizedAccounts() {
    const authListLength = this.request.authorizedAccounts.length;

    return `${authListLength} account${authListLength !== 1 ? 's' : ''}`;
  }

  removeAuth() {
    this.deleteAuthConnection(this.stripUrl);
  }

  onClick(event: CustomEvent) {
    const classList = event.target?.classList;

    if (!classList.contains('trash')) this.$emit('openUpdateAuths', this.stripUrl);
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
.row {
  display: flex;
  align-items: center;
}
</style>
