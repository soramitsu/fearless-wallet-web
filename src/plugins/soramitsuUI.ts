import { plugin as createSoramitsuPlugin, Status } from '@soramitsu-ui/ui';
import '@soramitsu-ui/ui/styles';
import { showAlertDialog, showPromptDialog } from '@/plugins/dialogService';

export type SoramitsuApp = {
  use: (plugin: unknown, ...options: unknown[]) => unknown;
  config: {
    globalProperties: Record<string, unknown>;
  };
};

const NOTIFICATION_STATUS = {
  Info: Status.Info,
  Success: Status.Success,
  Warning: Status.Warning,
  Error: Status.Error,
} as const satisfies Record<string, (typeof Status)[keyof typeof Status]>;

type NotificationStatus = (typeof Status)[keyof typeof Status];

type NotificationType = keyof typeof NOTIFICATION_STATUS | NotificationStatus | string;

type NotificationPayload = {
  message: string;
  title: string;
  type: NotificationType;
};

type NormalizedNotificationPayload = Omit<NotificationPayload, 'type'> & { type: NotificationStatus };

type NotificationListener = (payload: NormalizedNotificationPayload) => void;

const listeners = new Set<NotificationListener>();
type BasicMessage = string | { message: string; title?: string; type?: NotificationType };
type NotificationsApi = {
  show: (params: {
    title?: string;
    description?: string;
    status?: NotificationStatus;
    timeout?: number;
    showCloseBtn?: boolean;
  }) => { close: () => void };
};

let notificationsApi: NotificationsApi | null = null;

export const setNotificationsApi = (api: NotificationsApi | null) => {
  notificationsApi = api;
};

export const registerNotificationListener = (listener: NotificationListener) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

const normalizeMessage = (input: BasicMessage): NotificationPayload => {
  if (typeof input === 'string') {
    return {
      message: input,
      title: '',
      type: NOTIFICATION_STATUS.Info,
    };
  }

  return {
    message: input.message,
    title: input.title ?? '',
    type: input.type ?? NOTIFICATION_STATUS.Info,
  };
};

export const resolveStatus = (type: NotificationType): NotificationStatus => {
  if (typeof type === 'string') {
    const normalized = type.toLowerCase();

    const statusValue = (Object.values(NOTIFICATION_STATUS) as string[]).find((value) => value === normalized);

    if (statusValue) return statusValue as NotificationStatus;

    const statusKey = (Object.keys(NOTIFICATION_STATUS) as Array<keyof typeof NOTIFICATION_STATUS>).find(
      (key) => key.toLowerCase() === normalized
    );

    if (statusKey) return NOTIFICATION_STATUS[statusKey];
  } else if ((Object.values(NOTIFICATION_STATUS) as NotificationStatus[]).includes(type as NotificationStatus)) {
    return type as NotificationStatus;
  }

  return NOTIFICATION_STATUS.Info;
};

const emitNotification = ({ message, title, type }: NotificationPayload) => {
  const resolvedType = resolveStatus(type);
  const payload: NormalizedNotificationPayload = { message, title, type: resolvedType };

  notificationsApi?.show({
    title: payload.title,
    description: payload.message,
    status: payload.type,
    timeout: 2500,
    showCloseBtn: true,
  });

  listeners.forEach((listener) => listener(payload));
};

export const useNotify = () => emitNotification;

export const installSoramitsuUI = (app: SoramitsuApp) => {
  app.use(createSoramitsuPlugin());
  app.config.globalProperties.$notify = emitNotification;
  app.config.globalProperties.$message = (payload: BasicMessage) => emitNotification(normalizeMessage(payload));

  app.config.globalProperties.$alert = (payload: BasicMessage) => {
    const normalized = normalizeMessage(payload);
    emitNotification(normalized);

    return showAlertDialog({ message: normalized.message, title: normalized.title });
  };

  app.config.globalProperties.$prompt = (message: string, title?: string, defaultValue?: string) =>
    showPromptDialog({ message, title, defaultValue });
};

export default installSoramitsuUI;
