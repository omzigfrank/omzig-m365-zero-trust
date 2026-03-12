"use client";

import React from "react";
import { WizardStepTenantDetails } from "./WizardStepTenantDetails";
import { WizardStepConnectionMethod } from "./WizardStepConnectionMethod";
import { WizardStepConnectVerify } from "./WizardStepConnectVerify";
import { WizardStepProvisioning } from "./WizardStepProvisioning";
import { WizardStepComplete } from "./WizardStepComplete";
import { ArrowLeft } from "lucide-react";
import type { GdapVerificationResult } from "@/lib/tenant-api";

const STEP_LABELS = [
  "Tenant Details",
  "Connection Method",
  "Connect & Verify",
  "Provisioning",
  "Complete",
];

interface OnboardingWizardProps {
  currentStep: number;
  tenantId: string | null;
  displayName: string | null;
  connectionMethod: "oauth" | "gdap" | null;
  consentUrl: string | null;
  gdapResult: GdapVerificationResult | null;
  provisioningStatus: {
    dbCreated: boolean;
    tokenStored: boolean;
    firstAuditTriggered: boolean;
  };
  error: string | null;
  loading: boolean;
  submitTenantDetails: (data: {
    displayName: string;
    primaryDomain: string;
    contactEmail: string;
  }) => Promise<void>;
  selectConnectionMethod: (method: "oauth" | "gdap") => Promise<void>;
  generateConsent: () => Promise<void>;
  verifyGdapRelationship: (relationshipId: string) => Promise<void>;
  advanceToProvisioning: () => Promise<void>;
  startProvisioning: () => Promise<void>;
  goBack: () => void;
  resetWizard: () => Promise<void>;
}

export function OnboardingWizard(props: OnboardingWizardProps) {
  const { currentStep, goBack } = props;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;

          return (
            <React.Fragment key={stepNum}>
              <div className="flex flex-col items-center">
                <div
                  data-testid={`step-indicator-${stepNum}`}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : isCompleted
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isCompleted ? "\u2713" : stepNum}
                </div>
                <span
                  className={`mt-2 text-xs ${
                    isActive
                      ? "font-semibold text-blue-600"
                      : isCompleted
                        ? "text-green-600"
                        : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < STEP_LABELS.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 ${
                    stepNum < currentStep ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Back button (steps 2-3 only) */}
      {currentStep >= 2 && currentStep <= 3 && (
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      )}

      {/* Current step content */}
      <div className="rounded-xl border border-gray-200 bg-white p-8">
        {currentStep === 1 && (
          <WizardStepTenantDetails
            onSubmit={props.submitTenantDetails}
            loading={props.loading}
            error={props.error}
          />
        )}
        {currentStep === 2 && (
          <WizardStepConnectionMethod
            onSelect={props.selectConnectionMethod}
          />
        )}
        {currentStep === 3 && (
          <WizardStepConnectVerify
            connectionMethod={props.connectionMethod}
            consentUrl={props.consentUrl}
            gdapResult={props.gdapResult}
            loading={props.loading}
            error={props.error}
            onGenerateConsent={props.generateConsent}
            onVerifyGdap={props.verifyGdapRelationship}
            onAdvanceToProvisioning={props.advanceToProvisioning}
          />
        )}
        {currentStep === 4 && (
          <WizardStepProvisioning
            provisioningStatus={props.provisioningStatus}
            loading={props.loading}
            error={props.error}
            onStartProvisioning={props.startProvisioning}
          />
        )}
        {currentStep === 5 && (
          <WizardStepComplete
            tenantId={props.tenantId}
            displayName={props.displayName}
            connectionMethod={props.connectionMethod}
            onConnectAnother={props.resetWizard}
          />
        )}
      </div>
    </div>
  );
}
