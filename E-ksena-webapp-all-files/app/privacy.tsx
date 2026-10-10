import { LegalDocument, PRIVACY_CONTACT_EMAIL, type LegalSection } from '@/components/legal-document';

// Structured around the right to be informed in Republic Act 10173 and its
// implementing rules: what is collected, why, on what basis, who receives it,
// how long it is kept, and what the data subject may do about it. The
// disclosure of automated decision-making is required because the platform
// classifies incidents with a model rather than a person.
const SECTIONS: LegalSection[] = [
  {
    heading: 'Who is responsible for your data',
    paragraphs: [
      'E-ksena is operated by Group ALT_RUN of the School of Computing and Information Technologies, Asia Pacific College, as a capstone project. For the purposes of Republic Act 10173, the Data Privacy Act of 2012, the group acts as the personal information controller.',
      `You can reach us about anything in this policy at ${PRIVACY_CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: 'What we collect from citizens',
    bullets: [
      'The video you record when reporting, normally five to ten seconds, including anyone and anything visible or audible in it.',
      'The location your device reports at the moment of the report, as coordinates and as the nearest address.',
      'Your account details: name, email address, mobile number and date of birth.',
      'The time of the report, and the status it moves through as responders handle it.',
      'Audio and video exchanged during a live call with a responder, while that call is in progress.',
    ],
  },
  {
    heading: 'What we collect from responders',
    bullets: [
      'Your name, username, email address and mobile number.',
      'Your service, rank, office and station address.',
      'A record of the dispatch actions you take: accepting, reassigning and resolving incidents.',
      'Your location while you are navigating to a scene, so the system can show your route and estimated arrival.',
    ],
  },
  {
    heading: 'Why we collect it, and on what basis',
    paragraphs: [
      'Reports, video and location exist so an emergency can be classified, routed to the right service and responded to. Account details exist so responders can be identified and contacted, and so that only authorised personnel reach incident data. Dispatch actions are logged so it can later be established who did what to an incident.',
      'We rely on your consent, given when you create an account and when you submit a report. Where a report concerns a threat to life, health or safety, the Data Privacy Act also permits processing to protect vital interests. We do not use your data for advertising and we do not sell it.',
    ],
  },
  {
    heading: 'Automated analysis of your video',
    paragraphs: [
      'Your video is analysed by a machine learning model, not by a person, before any responder sees it. The model assigns a category such as fire, medical or police, together with a confidence score, and that score determines whether the report is escalated automatically or held for human review.',
      'This is automated processing, and you have the right to know it is happening. A responder reviews the incident before acting, and no decision affecting you is made by the model alone. If you believe a classification was wrong, tell us using the contact address above.',
    ],
  },
  {
    heading: 'Who else sees your data',
    paragraphs: [
      'Some of these providers store data on servers outside the Philippines. We use them because the platform depends on them, and we share only what each one needs to perform its function.',
    ],
    bullets: [
      'Responders from the service your report is routed to, and the administrators of this platform.',
      'Supabase, which hosts the database and stores submitted video.',
      'Google Maps Platform, which receives location data to display maps and calculate routes.',
      'Vercel, which hosts the responder dashboard.',
      'SMS gateways, where a report is submitted or acknowledged by text message.',
      'Law enforcement or other authorities, where we are legally required to disclose, or where disclosure is necessary to protect someone from harm.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'Incident video and report records are kept while the incident is being handled and for a limited period afterwards so that a response can be reviewed. Responder account records are kept while the account is active. Dispatch logs are kept as the record of who acted on an incident.',
      'Because E-ksena is a student project rather than a deployed government service, retention periods have not been fixed by any agency. Data held for the project may be deleted when it ends. If you want your data removed sooner, ask us.',
    ],
  },
  {
    heading: 'How we protect it',
    paragraphs: [
      'No system is completely secure. If a breach occurs that is likely to put you at risk, we will notify you and the National Privacy Commission as the law requires.',
    ],
    bullets: [
      'Accounts are protected by a password, and the system requires a strong one.',
      'Access to incident data is restricted at the database level, not only in the interface, so a responder can only read incidents belonging to their own service.',
      'Responder contact details are readable only by that responder and by an administrator.',
      'Emergency records cannot be deleted from the applications.',
      'Dispatch actions are written to an audit log.',
      'Connections to the platform are encrypted in transit.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: ['Under the Data Privacy Act you have the right to:'],
    bullets: [
      'Be informed that your personal data is being collected and processed.',
      'Access the personal data we hold about you.',
      'Object to processing, or withdraw consent you previously gave.',
      'Have inaccurate or outdated data corrected.',
      'Have your data erased or blocked, where there is no lawful reason to keep it.',
      'Be told of, and claim compensation for, damage caused by false or unlawfully obtained data.',
      'Receive a copy of your data in a portable electronic format.',
      'Complain to the National Privacy Commission.',
    ],
  },
  {
    heading: 'Using those rights',
    paragraphs: [
      `Write to ${PRIVACY_CONTACT_EMAIL} and say what you want to do. We may ask you to confirm who you are before acting, so that nobody else can request your data.`,
      'Two limits are worth stating honestly. Deleting a submitted report may not be possible where it forms part of the record of an emergency response. And a video may show people other than you, whose interests we also have to weigh.',
      'If you are not satisfied with how we respond, you can complain to the National Privacy Commission at privacy.gov.ph.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'E-ksena is not intended for children, and we do not knowingly collect their data through account registration. Anyone may be visible in a video recorded at an emergency, including children; that footage is treated with the same restrictions as all other incident media.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'This policy may change as the platform develops. The effective date at the top shows when this version took effect, and material changes will be announced in the application.',
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalDocument
      title="Privacy Policy"
      effectiveDate="10 October 2026"
      intro="E-ksena handles emergency video, location and contact details, which are sensitive by nature. This policy explains what we collect, why, who sees it and what you can do about it. It is written to meet the right to be informed under the Data Privacy Act of 2012."
      sections={SECTIONS}
    />
  );
}
