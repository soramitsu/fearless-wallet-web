declare module '@soramitsu-ui/ui' {
  import type { DefineComponent, Plugin } from 'vue';

  export const Status: {
    readonly Info: 'info';
    readonly Success: 'success';
    readonly Warning: 'warning';
    readonly Error: 'error';
  };

  export type Status = (typeof Status)[keyof typeof Status];

  export function useNotifications(): {
    show(payload: {
      title?: string;
      description?: string;
      status?: Status;
      timeout?: number;
      showCloseBtn?: boolean;
    }): { close: () => void };
  };

  export const SNotificationsProvider: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export function plugin(): Plugin;
}

declare module '@soramitsu-ui/ui/styles' {
  const content: Record<string, string>;
  export default content;
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $notify: (payload: { message: string; title: string; type?: string }) => void;
    $message: (payload: string | { message: string; title?: string; type?: string }) => void;
    $alert: (payload: string | { message: string; title?: string; type?: string }) => Promise<void>;
    $prompt: (message: string, title?: string) => Promise<{ value: string | null }>;
  }

  interface GlobalComponents {
    SNotificationsProvider: (typeof import('@soramitsu-ui/ui'))['SNotificationsProvider'];
  }
}
