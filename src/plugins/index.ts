import installSoramitsuUI, { type SoramitsuApp } from './soramitsuUI';

export const registerPlugins = (app: SoramitsuApp) => {
  installSoramitsuUI(app);
};

export default registerPlugins;
