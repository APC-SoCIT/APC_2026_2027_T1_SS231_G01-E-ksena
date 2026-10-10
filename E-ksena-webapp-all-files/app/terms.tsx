import { LegalDocument } from '@/components/legal-document';
import { TERMS_DOCUMENT } from '@/constants/legal-content';

export default function TermsScreen() {
  return <LegalDocument {...TERMS_DOCUMENT} />;
}
