import { commonViteConfig, makeDefine, portfolioDashboardBuildFlag } from '../../vite.config.shared.mjs';
import { PORTFOLIO_DASHBOARD_ENABLED } from '@/portfolio/dashboard/dashboardFlag';

describe('portfolio dashboard flag', () => {
  it('is on only for a non-production build that sets the flag to exactly true', () => {
    for (const mode of ['development', 'test', 'staging']) {
      expect(portfolioDashboardBuildFlag(mode, { VUE_APP_PORTFOLIO_DASHBOARD: 'true' })).toBe('true');
    }
    for (const flag of [undefined, '', 'false', '1', 'TRUE', 'yes', ' true']) {
      expect(portfolioDashboardBuildFlag('development', { VUE_APP_PORTFOLIO_DASHBOARD: flag })).toBe('false');
    }
  });

  it('never enables a production build, whatever the environment says', () => {
    expect(portfolioDashboardBuildFlag('production', { VUE_APP_PORTFOLIO_DASHBOARD: 'true' })).toBe('false');
    expect(portfolioDashboardBuildFlag('production', {})).toBe('false');
  });

  it('is off when the bundler did not say which mode it ran in', () => {
    for (const mode of [undefined, '', null, 7]) {
      expect(portfolioDashboardBuildFlag(mode as never, { VUE_APP_PORTFOLIO_DASHBOARD: 'true' })).toBe('false');
    }
  });

  it('reaches the bundle as one literal, decided by the mode and the variable together', () => {
    const defineFor = (mode: string, flag: string | undefined) => {
      const previous = process.env.VUE_APP_PORTFOLIO_DASHBOARD;

      if (flag === undefined) delete process.env.VUE_APP_PORTFOLIO_DASHBOARD;
      else process.env.VUE_APP_PORTFOLIO_DASHBOARD = flag;
      try {
        return commonViteConfig({ mode, outDir: 'dist/test-flag', publicDir: false }).define['process.env.FW_PORTFOLIO_DASHBOARD'];
      } finally {
        if (previous === undefined) delete process.env.VUE_APP_PORTFOLIO_DASHBOARD;
        else process.env.VUE_APP_PORTFOLIO_DASHBOARD = previous;
      }
    };

    expect(defineFor('development', 'true')).toBe(JSON.stringify('true'));
    expect(defineFor('production', 'true')).toBe(JSON.stringify('false'));
    expect(defineFor('development', undefined)).toBe(JSON.stringify('false'));
    expect(makeDefine('production', { VUE_APP_PORTFOLIO_DASHBOARD: 'true' })['process.env.FW_PORTFOLIO_DASHBOARD']).toBe(JSON.stringify('false'));
  });

  it('does not leave the raw variable or the mode in the bundle for anyone to test instead', () => {
    const define = makeDefine('development', { VUE_APP_PORTFOLIO_DASHBOARD: 'true' });

    expect(define).not.toHaveProperty('process.env.VUE_APP_PORTFOLIO_DASHBOARD');
    expect(define).not.toHaveProperty('process.env.VITE_BUILD_MODE');
  });

  it('is off in the unit-test build, where the variable is not set', () => {
    expect(PORTFOLIO_DASHBOARD_ENABLED).toBe(false);
  });
});
