/**
 * The wording of the Terms and Conditions and the Privacy Policy, kept apart
 * from any screen that renders it.
 *
 * The citizen app and the responder dashboard have to show the same text: a
 * platform cannot tell two sets of people two different things about what it
 * collects from them. This file is the one copy. It imports nothing and uses
 * no framework, so the mobile app can take it unchanged, and an edit here is
 * an edit in both places rather than a change one side forgets to mirror.
 *
 * If you change anything below, move the effective date and tell whoever
 * maintains the other platform.
 */

export type LegalSection = {
  heading: string;
  /** Prose for this section. Rendered before the bullets. */
  paragraphs?: string[];
  bullets?: string[];
  /**
   * Draws the section out of the run of text. Reserved for the two clauses a
   * reader is harmed by missing: that this is not a substitute for 911, and
   * that a model reads the video before any person does.
   */
  emphasis?: boolean;
};

export type LegalDocumentContent = {
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
};

/**
 * The address a data subject writes to in order to exercise their rights under
 * the Data Privacy Act. The law expects a reachable contact, so this has to be
 * a mailbox the group actually monitors -- not a personal address that stops
 * being read once the term ends.
 */
export const PRIVACY_CONTACT_EMAIL = 'pmsumilhig@student.apc.edu.ph';

/**
 * Drawn from the ALT_RUN SOFTDEV Project Documentation: the scope in 1.4, the
 * classification categories and confidence threshold in the related
 * literature, and the stated constraints. Where the documentation records a
 * limitation, it is stated here as a limitation rather than written around.
 */
export const TERMS_DOCUMENT: LegalDocumentContent = {
  title: 'Terms and Conditions',
  effectiveDate: '10 October 2026',
  intro:
    'These terms govern your use of E-ksena, for citizens reporting emergencies and for responders receiving them. By creating an account or submitting a report you accept them. Please read section 2 in particular.',
  sections: [
    {
      heading: 'What E-ksena is',
      paragraphs: [
        'E-ksena is an emergency reporting and dispatch platform. A citizen records a short video of five to ten seconds, which the system classifies automatically and routes to the appropriate service, together with the location the device reports. Responders receive the incident on a dashboard with a map, the submitted video and a live call channel.',
        'The platform was built as a capstone project at Asia Pacific College and is targeted at local government deployment in Makati City. It is a prototype. It is not a government emergency service and is not operated by one.',
      ],
    },
    {
      heading: 'E-ksena does not replace 911',
      emphasis: true,
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
      paragraphs: [
        'The project documentation records the following constraints, and they apply to you as a user:',
      ],
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
  ],
};

/**
 * Structured around the right to be informed in Republic Act 10173 and its
 * implementing rules: what is collected, why, on what basis, who receives it,
 * how long it is kept, and what the data subject may do about it. The
 * disclosure of automated decision-making is required because the platform
 * classifies incidents with a model rather than a person.
 */
export const PRIVACY_DOCUMENT: LegalDocumentContent = {
  title: 'Privacy Policy',
  effectiveDate: '10 October 2026',
  intro:
    'E-ksena handles emergency video, location and contact details, which are sensitive by nature. This policy explains what we collect, why, who sees it and what you can do about it. It is written to meet the right to be informed under the Data Privacy Act of 2012.',
  sections: [
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
      emphasis: true,
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
  ],
};
