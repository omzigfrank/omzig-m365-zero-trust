export interface Organization {
  id: string;
  name: string;
  slug: string;
  sessionTimeoutMinutes: number;
  inactivityDisableDays: number;
  createdAt: string;
}

export interface OrgConfig {
  sessionTimeoutMinutes: number; // min: 15, max: 1440
  inactivityDisableDays: number; // min: 30, max: 365
}

export interface SetupWizardState {
  currentStep: number;
  totalSteps: number;
  stepsCompleted: number[];
  isComplete: boolean;
}
