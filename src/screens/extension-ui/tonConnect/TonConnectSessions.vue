<template>
  <div class="ton-sessions">
    <header class="ton-sessions__header">
      <button class="ton-sessions__back" type="button" :aria-label="t('irohaConnectPage.backToSettings')" @click="goBack">
        <Icon icon="chevron-left" :hover="false" />
      </button>
      <div>
        <h1>{{ PROTOCOL_NAME }}</h1>
        <p>{{ t('settingsPage.tonConnectDescription') }}</p>
      </div>
    </header>

    <ContentForm fillHeight>
      <Scroll>
        <p v-if="loadError" role="alert" class="ton-sessions__message">{{ t('addWallet.google.somethingWrong') }}</p>
        <p v-else-if="!sessions.length" class="ton-sessions__message" data-testid="tonConnectNoSessions">
          {{ t('authorize.noconnections') }}
        </p>
        <ul v-else class="ton-sessions__list">
          <li v-for="session in sessions" :key="session.origin" class="ton-sessions__item" data-testid="tonConnectSession">
            <img
              v-if="iconOf(session) && !failedIcons.has(session.origin)"
              class="ton-sessions__icon"
              :src="iconOf(session)"
              width="40"
              height="40"
              alt=""
              referrerpolicy="no-referrer"
              @error="failedIcons.add(session.origin)"
            />
            <Icon v-else class="ton-sessions__fallback" icon="globus" width="40px" height="40px" :hover="false" />
            <div class="ton-sessions__details">
              <h2 dir="auto">{{ session.manifest.name }}</h2>
              <p class="ton-sessions__origin" dir="ltr">{{ session.origin }}</p>
              <p class="ton-sessions__wallet">
                <span>{{ session.accountName || t('irohaConnectPage.account') }}</span>
                <span dir="ltr">{{ shorten(session.address) }}</span>
              </p>
              <p class="ton-sessions__date">{{ formatDate(session.connectedAt) }}</p>
            </div>
            <FButton
              :data-testid="`disconnectTonConnect-${session.origin}`"
              text="authorize.disconnect"
              type="secondary"
              size="medium"
              :disabled="busy.has(session.origin)"
              :loading="busy.has(session.origin)"
              @click="disconnect(session.origin)"
            />
          </li>
        </ul>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { TonConnectSessionView } from '@extension-base/services/ton-connect-service';
import { useI18n } from '@/locales/useI18n';
import { useNotify } from '@/plugins/soramitsuUI';
import { Components } from '@/router/routes';
import { useExtensionStore } from '@/stores/extension';

// The protocol's own name, not translated, as Settings shows it.
const PROTOCOL_NAME = 'TON Connect';
const extensionStore = useExtensionStore();
const router = useRouter();
const notify = useNotify();
const { t, locale } = useI18n();
const loadError = ref(false);
const busy = reactive(new Set<string>());
const failedIcons = reactive(new Set<string>());
const sessions = computed(() => extensionStore.tonConnectSessions);

const iconOf = (session: TonConnectSessionView): string => {
  try {
    const url = new URL(session.manifest.iconUrl);

    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};
const shorten = (address: string) => (address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address);
const formatDate = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
};

const disconnect = async (origin: string) => {
  if (busy.has(origin)) return;
  busy.add(origin);
  try {
    await extensionStore.disconnectTonConnectSession(origin);
  } catch {
    notify({ title: t('addWallet.google.somethingWrong'), message: '', type: 'error' });
  } finally {
    busy.delete(origin);
  }
};

const goBack = () => router.push({ name: Components.Settings });

onMounted(async () => {
  try {
    await extensionStore.subscribeTonConnectSessions();
  } catch {
    loadError.value = true;
  }
});
</script>

<style lang="scss" scoped>
.ton-sessions {
  display: flex;
  flex-direction: column;
  height: 100%;
  text-align: left;
}

.ton-sessions__header {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 0 2px 8px;

  h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  p {
    margin: 2px 0 0;
    color: var(--fw-text-2);
  }
}

.ton-sessions__back {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 8px;
  background: transparent;
  color: var(--fw-text-1);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
  }
}

.ton-sessions__message {
  margin: 16px;
  color: var(--fw-text-2);
}

.ton-sessions__list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.ton-sessions__item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--fw-stroke-control);
  background: var(--fw-raised);
}

.ton-sessions__icon {
  object-fit: contain;
  border-radius: 10px;
}

.ton-sessions__fallback {
  fill: none;
}

.ton-sessions__details {
  min-width: 0;

  h2 {
    margin: 0;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  p {
    margin: 2px 0 0;
    overflow-wrap: anywhere;
  }
}

.ton-sessions__origin {
  font-family: var(--fw-font-mono);
  color: var(--fw-text-2);
}

.ton-sessions__wallet {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span:last-child {
    font-family: var(--fw-font-mono);
    color: var(--fw-text-2);
  }
}

.ton-sessions__date {
  color: var(--fw-text-2);
  font-size: 0.875rem;
}
</style>
