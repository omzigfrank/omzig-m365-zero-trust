/**
 * Devices area collector.
 * Parses: /deviceManagement/managedDevices?$select=id,complianceState&$top=999
 *
 * Response type: Collection (has `value` array)
 */

import type { DevicesFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface DevicesResponse {
  value?: Array<{
    id: string;
    complianceState: string;
  }>;
}

export function parseDevices(data: unknown): DevicesFacts {
  if (isBatchError(data)) {
    return {
      available: false,
      totalDevices: 0,
      compliantDevices: 0,
      nonCompliantDevices: 0,
      error: `Graph API error: status ${(data as { status: number }).status}`,
    };
  }

  const response = data as DevicesResponse;
  const devices = response.value ?? [];

  let compliantDevices = 0;
  let nonCompliantDevices = 0;

  for (const device of devices) {
    if (device.complianceState === 'compliant') {
      compliantDevices++;
    } else if (device.complianceState === 'noncompliant') {
      nonCompliantDevices++;
    }
  }

  return {
    available: true,
    totalDevices: devices.length,
    compliantDevices,
    nonCompliantDevices,
  };
}
