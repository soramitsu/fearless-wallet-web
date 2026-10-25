import { i18n } from '@/locales';
import { dashboardMessages } from '@/portfolio/dashboard/messages';

// Merges the dashboard's messages (./messages.ts) into vue-i18n the first time it is asked. Nothing is registered in a
// build that never mounts the dashboard, and every locale without its own text reads the English one through the fallback.
let registered = false;

export function registerDashboardMessages(): void {
  if (registered) return;

  registered = true;
  Object.entries(dashboardMessages).forEach(([locale, messages]) => {
    i18n.global.mergeLocaleMessage(locale, { portfolioDashboard: messages });
  });
}
