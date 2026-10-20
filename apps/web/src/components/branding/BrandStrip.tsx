import { hasBranding, type Branding } from '@quizup/shared';
import { BrandMark } from './BrandMark';

export function BrandStrip({ branding }: { branding: Branding | null }) {
  if (!hasBranding(branding)) {
    return null;
  }
  return (
    <div className="mb-4 flex items-center border-b border-rule pb-3">
      <BrandMark branding={branding} size="xs" />
    </div>
  );
}
