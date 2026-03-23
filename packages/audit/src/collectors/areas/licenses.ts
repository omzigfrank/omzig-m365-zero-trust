/**
 * Licenses area collector.
 * Parses: /subscribedSkus
 *
 * Response type: Collection (has `value` array)
 * Ported from TenantFactCollector.ps1 SKU name mapping.
 */

import type { LicensesFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

/** SKU friendly name map (from TenantFactCollector.ps1) */
const SKU_NAMES: Record<string, string> = {
  ENTERPRISEPACK: 'Microsoft 365 E3',
  ENTERPRISEPREMIUM: 'Microsoft 365 E5',
  SPE_E3: 'Microsoft 365 E3',
  SPE_E5: 'Microsoft 365 E5',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  SPB: 'Microsoft 365 Business Premium',
  EMS: 'Enterprise Mobility + Security E3',
  EMSPREMIUM: 'Enterprise Mobility + Security E5',
  AAD_PREMIUM: 'Entra ID P1',
  AAD_PREMIUM_P2: 'Entra ID P2',
  ATP_ENTERPRISE: 'Defender for Office 365 P1',
  THREAT_INTELLIGENCE: 'Defender for Office 365 P2',
  WIN_DEF_ATP: 'Defender for Endpoint P1',
  INTUNE_A: 'Microsoft Intune',
};

/** SKUs that qualify for full M365 features */
const QUALIFYING_SKUS = new Set([
  'ENTERPRISEPACK',
  'ENTERPRISEPREMIUM',
  'SPE_E3',
  'SPE_E5',
  'SPB',
  'EMSPREMIUM',
]);

/** SKUs that include Entra ID P2 */
const P2_SKUS = new Set(['AAD_PREMIUM_P2', 'ENTERPRISEPREMIUM', 'SPE_E5', 'EMSPREMIUM']);

/** SKUs that include Intune */
const INTUNE_SKUS = new Set([...QUALIFYING_SKUS, 'INTUNE_A']);

/** SKUs that include Defender for Office 365 */
const DEFENDER_O365_SKUS = new Set([
  'ATP_ENTERPRISE',
  'THREAT_INTELLIGENCE',
  'ENTERPRISEPREMIUM',
  'SPE_E5',
]);

/** SKUs that include Defender for Endpoint */
const DEFENDER_ENDPOINT_SKUS = new Set(['WIN_DEF_ATP', 'ENTERPRISEPREMIUM', 'SPE_E5']);

interface SubscribedSkusResponse {
  value?: Array<{
    skuPartNumber: string;
    prepaidUnits: { enabled: number };
    consumedUnits: number;
  }>;
}

export function parseLicenses(data: unknown): LicensesFacts {
  if (isBatchError(data)) {
    return {
      available: false,
      hasQualifyingSku: false,
      hasP2: false,
      hasIntune: false,
      hasDefenderO365: false,
      hasDefenderEndpt: false,
      licenses: [],
      error: `Graph API error: status ${(data as { status: number }).status}`,
    };
  }

  const response = data as SubscribedSkusResponse;
  const skus = response.value ?? [];

  let hasQualifyingSku = false;
  let hasP2 = false;
  let hasIntune = false;
  let hasDefenderO365 = false;
  let hasDefenderEndpt = false;

  const licenses = skus.map((sku) => {
    const partNumber = sku.skuPartNumber;
    const friendlyName = SKU_NAMES[partNumber] ?? partNumber;
    const total = sku.prepaidUnits.enabled;
    const consumed = sku.consumedUnits;

    if (QUALIFYING_SKUS.has(partNumber)) hasQualifyingSku = true;
    if (P2_SKUS.has(partNumber)) hasP2 = true;
    if (INTUNE_SKUS.has(partNumber)) hasIntune = true;
    if (DEFENDER_O365_SKUS.has(partNumber)) hasDefenderO365 = true;
    if (DEFENDER_ENDPOINT_SKUS.has(partNumber)) hasDefenderEndpt = true;

    return {
      skuPartNumber: partNumber,
      friendlyName,
      total,
      consumed,
      available: total - consumed,
    };
  });

  return {
    available: true,
    hasQualifyingSku,
    hasP2,
    hasIntune,
    hasDefenderO365,
    hasDefenderEndpt,
    licenses,
  };
}
