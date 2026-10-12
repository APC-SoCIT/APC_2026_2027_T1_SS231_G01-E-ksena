import React from 'react';
import { LegalDocument } from './LegalDocument';
import { TERMS_DOCUMENT } from './legal-content';

export default function TermsScreen({ navigation }: any) {
  return <LegalDocument {...TERMS_DOCUMENT} onBack={() => navigation.goBack()} />;
}
