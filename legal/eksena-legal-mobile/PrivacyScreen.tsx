import React from 'react';
import { LegalDocument } from './LegalDocument';
import { PRIVACY_DOCUMENT } from './legal-content';

export default function PrivacyScreen({ navigation }: any) {
  return <LegalDocument {...PRIVACY_DOCUMENT} onBack={() => navigation.goBack()} />;
}
