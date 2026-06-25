import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import type { App } from 'vue';
import 'element-plus/dist/index.css';
import { i18n } from '@/locales';

type SNotificationParams = {
  message: string;
  title: string;
  type: 'success' | 'warning' | 'info' | 'error' | string;
};

const notificationFn = ({ message, title, type }: SNotificationParams) => {
  ElNotification({
    message,
    title,
    duration: 2500,
    type: type as 'success' | 'warning' | 'info' | 'error',
    customClass: 'sora s-flex fearless-notify',
  });
};

export const useNotify = () => notificationFn;

export function registerSoramitsuUI(app: App) {
  app.config.globalProperties.$prompt = ElMessageBox.prompt;
  app.config.globalProperties.$alert = ElMessageBox.alert;
  app.config.globalProperties.$message = ElMessage;
  app.config.globalProperties.$notify = notificationFn;
  app.config.globalProperties.$tc = (key: string, choice?: number, values?: Record<string, unknown>) =>
    i18n.global.t(key, choice ?? 1, values ?? {});
}
