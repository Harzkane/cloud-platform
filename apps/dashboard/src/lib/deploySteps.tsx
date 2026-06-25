import React from 'react';

/** Maps deployment status to the last completed build step (1–6). */
const COMPLETED_STEP: Record<string, number> = {
  QUEUED: 0,
  CLONING: 1,
  BUILDING: 2,
  PUSHING: 3,
  STARTING: 4,
  RUNNING: 6,
  READY: 6,
};

const IN_PROGRESS = new Set(['QUEUED', 'CLONING', 'BUILDING', 'PUSHING', 'STARTING']);

export function isDeploymentInProgress(status: string) {
  return IN_PROGRESS.has(status);
}

export function getStepIndicator(stepIndex: number, currentStatus: string) {
  const doneThrough = COMPLETED_STEP[currentStatus] ?? -1;

  if (currentStatus === 'FAILED') {
    const failedAt = doneThrough >= 0 ? doneThrough + 1 : 1;
    if (stepIndex === failedAt) {
      return <div className="step-indicator step-pending">✕</div>;
    }
    if (stepIndex < failedAt) {
      return <div className="step-indicator step-done">✓</div>;
    }
    return <div className="step-indicator step-pending">{stepIndex}</div>;
  }

  if (doneThrough >= stepIndex) {
    return <div className="step-indicator step-done">✓</div>;
  }
  if (doneThrough === stepIndex - 1) {
    return <div className="step-indicator step-active">●</div>;
  }
  return <div className="step-indicator step-pending">{stepIndex}</div>;
}
