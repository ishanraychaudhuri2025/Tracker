import type { MouseEventHandler } from 'react';
import './BrandLockup.css';

export type BrandLockupVariant = 'sidebar' | 'auth';

type BrandLockupProps = {
  variant: BrandLockupVariant;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

function BrandContents() {
  return (
    <>
      <img className="cadence-brand-icon" src="/cadence-icon.svg" alt="" aria-hidden="true" width="50" height="50" />
      <span className="cadence-brand-wordmark">CADENCE</span>
    </>
  );
}

export default function BrandLockup({ variant, onClick }: BrandLockupProps) {
  if (variant === 'sidebar') {
    return (
      <button
        className="cadence-brand-lockup cadence-brand-lockup--sidebar"
        type="button"
        aria-label="Go to Cadence dashboard"
        onClick={onClick}
      >
        <BrandContents />
      </button>
    );
  }

  return (
    <div className="cadence-brand-lockup cadence-brand-lockup--auth" role="img" aria-label="Cadence">
      <BrandContents />
    </div>
  );
}
