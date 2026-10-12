# E-ksena legal pages, for the mobile app

The responder dashboard now shows a Terms and Conditions page and a Privacy
Policy. The citizen app needs the same two, with **the same wording** — the
platform cannot tell citizens one thing and responders another about what it
collects from them.

Everything here is already live on the web side.

## What is in this folder

| File | What it is |
|---|---|
| `legal-content.ts` | **The wording.** Shared between both apps. Copy it as-is. |
| `LegalDocument.tsx` | A plain React Native renderer. No navigation library, no path aliases, no theme import. |
| `TermsScreen.tsx`, `PrivacyScreen.tsx` | Example screens, React Navigation style. |
| `TERMS.md`, `PRIVACY.md` | The same text as Markdown, for the documentation. Generated from `legal-content.ts`. |

## Installing it

1. Copy `legal-content.ts`, `LegalDocument.tsx`, `TermsScreen.tsx` and
   `PrivacyScreen.tsx` into the mobile app, for example under
   `frontend/screens/legal/`.
2. Register both screens in your navigator:

```tsx
<Stack.Screen name="Terms" component={TermsScreen} options={{ title: 'Terms and Conditions' }} />
<Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy Policy' }} />
```

3. Restyle `LegalDocument.tsx` to match the app. Colours and spacing are at the
   bottom of that file. **Change the styling freely; do not change the text.**

## What the citizen app still needs

Showing the pages is only half of it. On the web side registration will not
proceed until the user ticks a box agreeing to both, and the box starts
unticked — under the Data Privacy Act, agreement that was assumed is not
consent. The citizen app needs the same thing, and it matters more there,
because the citizen side is what records video of bystanders and collects
location.

Two places to add it:

- **On sign-up**, a checkbox linking to both screens, blocking registration
  until it is ticked.
- **Before the first recording**, a short notice that the video is analysed
  automatically and shown to responders. Section 5 of the Privacy Policy
  explains this. Right now nothing in either app mentions it, and the law
  requires telling people when a machine processes their data.

## Keeping them identical

`legal-content.ts` is the single copy of the wording. If either side edits it:

1. Change it in one place, not two.
2. Move the `effectiveDate`.
3. Tell the other platform, so the copies stay the same.

Two divergent privacy notices for one system is worse than one imperfect
notice, because neither can then be relied on.

## Before any of this is real

`PRIVACY_CONTACT_EMAIL` at the top of `legal-content.ts` is still a
placeholder. A privacy notice that names an address nobody reads defeats its
own purpose. It needs a mailbox the group actually monitors, and the same
value must be used on both platforms.

The content has also not been reviewed by a lawyer. It is written to follow
the right to be informed under RA 10173 and the limitations recorded in the
ALT_RUN SOFTDEV Project Documentation, but it should be read by the adviser
before the final submission — particularly the retention section, which is
deliberately vague because no retention period has been set for the project.
