import { LegalDocument } from '@/components/legal-document';
import { PRIVACY_DOCUMENT } from '@/constants/legal-content';

export default function PrivacyScreen() {
  return <LegalDocument {...PRIVACY_DOCUMENT} />;
}
