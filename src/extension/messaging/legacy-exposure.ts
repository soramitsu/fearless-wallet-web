import type {
  LegacyExposureStatus,
  RequestUpdateLegacyExposure,
} from '@extension-base/services/legacy-exposure-service';
import { sendMessage } from '@/extension/messaging/index';

export function getLegacyExposureStatus(): Promise<LegacyExposureStatus> {
  return sendMessage('pri(security.legacyExposure.status)');
}

export function acknowledgeLegacyExposure(): Promise<LegacyExposureStatus> {
  return sendMessage('pri(security.legacyExposure.acknowledge)');
}

export function updateLegacyExposure(request: RequestUpdateLegacyExposure): Promise<LegacyExposureStatus> {
  return sendMessage('pri(security.legacyExposure.update)', request);
}
