import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isCapturedSoraPairStillSelected,
  isLocallySignableSelectedSoraPair,
} from '@/defi/soraAccountBinding';

const formatAddress = (address: string) => address.toLowerCase().replace(/^sora:/, '');

describe('SORA mutation account binding', () => {
  it('requires an explicit selected account that matches the local pair', () => {
    const pair = { address: 'SORA:Alice', meta: {} };

    expect(isLocallySignableSelectedSoraPair(pair, 'alice', formatAddress)).toBe(true);
    expect(isLocallySignableSelectedSoraPair(pair, '', formatAddress)).toBe(false);
    expect(isLocallySignableSelectedSoraPair(pair, 'bob', formatAddress)).toBe(false);
    expect(isLocallySignableSelectedSoraPair({ ...pair, meta: { isHardware: true } }, 'alice', formatAddress))
      .toBe(false);
  });

  it('rejects a captured pair after either the selected account or pair instance changes', () => {
    const captured = { address: 'alice', meta: {} };

    expect(isCapturedSoraPairStillSelected(captured, captured, 'alice', formatAddress)).toBe(true);
    expect(isCapturedSoraPairStillSelected(captured, captured, 'bob', formatAddress)).toBe(false);
    expect(isCapturedSoraPairStillSelected(captured, { ...captured }, 'alice', formatAddress)).toBe(false);
    expect(isCapturedSoraPairStillSelected(captured, undefined, 'alice', formatAddress)).toBe(false);
  });

  it('fails closed when address normalization throws', () => {
    const formatter = () => { throw new Error('invalid address'); };

    expect(isLocallySignableSelectedSoraPair({ address: 'alice' }, 'bob', formatter)).toBe(false);
  });

  it('wires the captured pair into Polkamarkt authorization immediately before submit', () => {
    const handlerSource = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/background/handlers/Extension.ts'),
      'utf8'
    );
    const handlerStart = handlerSource.indexOf('private createPolkamarktService()');
    const handlerEnd = handlerSource.indexOf('private async getPolkamarktSnapshot', handlerStart);
    const handler = handlerSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain('createPolkamarktFinalAuthorizationGuard({');
    expect(handler).toContain('capturedPair: pair');
    expect(handler).toContain("isActionEnabled('polkamarkt')");
    expect(handler).toContain('isDisclaimerAccepted: () => this.state.soraDisclaimerService.isAccepted()');
    expect(handler).toContain('unlockPair: (address) => this.state.keyringService.unlockPair(address)');

    const service = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/services/polkamarkt-service/index.ts'),
      'utf8'
    );
    const finalValidation = service.indexOf('prepareMutation(capturedRequest, true)');
    const authorization = service.indexOf('await this.options.authorizeBeforeSubmit(', finalValidation);
    const submit = service.indexOf('await this.options.submit(final.extrinsic)', authorization);
    expect(finalValidation).toBeGreaterThan(-1);
    expect(authorization).toBeGreaterThan(finalValidation);
    expect(submit).toBeGreaterThan(authorization);
  });
});
