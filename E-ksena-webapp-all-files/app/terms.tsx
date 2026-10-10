import { LegalDocument, PRIVACY_CONTACT_EMAIL, type LegalSection } from '@/components/legal-document';

// Drawn from the ALT_RUN SOFTDEV Project Documentation: the scope in 1.4, the
// classification categories and confidence threshold in the related literature,
// and the stated constraints. Where the documentation records a limitation, it
// is stated here as a limitation rather than written around.
const SECTIONS: LegalSection[] = [
  {
    heading: 'What E-ksena is',
    paragraphs: [
      'E-ksena is an emergency reporting and dispatch platform. A citizen records a short video of five to ten seconds, which the system classifies automatically and routes to the appropriate service, together with the location the device reports. Responders receive the incident on a dashboard with a map, the submitted video and a live call channel.',
      'The platform was built as a capstone project at Asia Pacific College and is targeted at local government deployment in Makati City. It is a prototype. It is not a government emergency service and is not operated by one.',
    ],
  },
  {
    heading: 'E-ksena does not replace 911',
    paragraphs: [
      'This is the most important term in this document. E-ksena depends on your device, your mobile data connection, third-party services and an automated classifier, any of which can fail or be unavailable. No part of the platform guarantees that a report will be delivered, classified correctly, seen by a responder, or acted upon.',
      'In a life-threatening emergency, call 911 or your local emergency hotline. Use E-ksena in addition to those channels, never instead of them.',
    ],
  },
  {
    heading: 'Who may use it',
    paragraphs: [
      'The citizen application is for members of the public reporting emergencies they are witnessing or involved in.',
      'The responder dashboard is for authorised personnel of a participating police, fire or medical service. Registering as a responder requires your real name, a working email address, a contact number and your service. You are responsible for everything done through your account, so do not share your password or let anyone else use it.',
    ],
  },
  {
    heading: 'Reporting honestly',
    paragraphs: [
      'Emergency resources are finite. A false report can send responders away from someone who genuinely needs them.',
      'You must not submit a report for an emergency that is not happening, submit video you did not record at the scene, deliberately misreport your location, or use the platform to harass, surveil or record anyone for any purpose other than reporting an emergency. Accounts used this way may be deactivated without notice, and submissions may be referred to the authorities.',
    ],
  },
  {
    heading: 'How the automated classification works, and where it fails',
    paragraphs: [
      'Submitted video is analysed by a machine learning model that assigns the incident a category and a confidence score. A score at or above 0.85 is treated as a confirmed emergency and escalated; lower scores are routed for human review or set aside.',
      'The model is not a person and does not understand context. It can misread an incident, miss one entirely, or classify a genuine emergency as something else. A responder reviews the incident before acting, and may reassign it to another service. Neither the classification nor any dispatch decision made from it is a professional, medical or legal judgement.',
    ],
  },
  {
    heading: 'Known limitations',
    paragraphs: ['The project documentation records the following constraints, and they apply to you as a user:'],
    bullets: [
      'Video analysis runs in the cloud, so reporting requires a working internet connection.',
      'Accuracy degrades in low light, in unstable network conditions, and where video is heavily compressed.',
      'The platform depends on external services for mapping, messaging and live calling. If one is unavailable or rate-limited, the corresponding feature stops working.',
      'Location accuracy is whatever the device reports, which can be wrong indoors or in dense urban areas.',
      'There is no iOS application. The citizen app is Android only.',
    ],
  },
  {
    heading: 'Responders and confidentiality',
    paragraphs: [
      'Incident video and location data can show victims, bystanders, private homes and distressing scenes. If you hold a responder account you may use what you see only to respond to that incident. Do not download, copy, share, publish or discuss incident media outside the response, and do not look at incidents you are not responding to.',
      'Access is logged. Misuse is a breach of these terms and may also breach the Data Privacy Act.',
    ],
  },
  {
    heading: 'Availability',
    paragraphs: [
      'The platform is provided as it is, without any warranty. As an academic prototype it may be taken offline, reset, or have its data cleared without notice. Do not rely on it as a system of record.',
    ],
  },
  {
    heading: 'Ownership',
    paragraphs: [
      'E-ksena was developed by Paul Brian Sumilhig, Peter Jr Arquines, Ezekiel Galauran and Jesmark David Presbitero of Asia Pacific College. You keep ownership of the video you submit, and grant permission for it to be processed, classified, stored and shown to responders for the purpose of handling your report.',
    ],
  },
  {
    heading: 'Changes to these terms',
    paragraphs: [
      'These terms may change as the platform develops. The effective date at the top shows when this version took effect. Continuing to use E-ksena after a change means you accept the revised terms.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      `Questions about these terms can be sent to ${PRIVACY_CONTACT_EMAIL}. How your personal data is handled is described separately in the Privacy Policy.`,
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalDocument
      title="Terms and Conditions"
      effectiveDate="10 October 2026"
      intro="These terms govern your use of E-ksena, for citizens reporting emergencies and for responders receiving them. By creating an account or submitting a report you accept them. Please read section 2 in particular."
      sections={SECTIONS}
    />
  );
}
