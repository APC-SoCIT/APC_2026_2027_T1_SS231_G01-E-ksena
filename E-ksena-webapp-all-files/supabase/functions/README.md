# Connecting SMS (UniSMS)

The Messages tab already saves every message a responder writes, and Accept on
the Map already queues a text for each reporter. These two functions are what
turn a saved message into a real text, and a reply into a line in the thread.
Nothing in the dashboard has to change to switch it on.

Until this is done, messages stay marked "Queued, not sent yet" and the
dashboard shows that SMS is not connected.

## One-way or two-way

UniSMS can send in two ways, and they are not the same thing for a messenger.

- **Under a sender ID** (a name, such as EKSENA). The text arrives, but the
  person cannot reply to a name. The chat is one-way.
- **From a virtual number** (a real mobile number UniSMS gives you). The person
  can reply, and the reply comes back into the thread. This is what a two-way
  chat needs. Virtual numbers are limited and given on request: ask UniSMS
  support for one. Texts sent from a virtual number may not contain links or
  one-time codes.

The function uses the virtual number when one is set, and falls back to the
sender ID when it is not.

## What you need first

- The tables: run `supabase/sms-messages.sql` in the Supabase SQL Editor.
- A UniSMS account (unismsapi.com) with credits.
- From the UniSMS dashboard: the API **secret key**; a **virtual number** or an
  approved **sender ID**; and the **Webhook Secret Key** from the Webhooks page.
- The Supabase CLI, signed in and linked to the project.

## Steps

1. Store the secrets. The secret key must never go in the web app, in an
   `EXPO_PUBLIC_` variable or in the repo.

   ```bash
   supabase secrets set UNISMS_SECRET_KEY=... UNISMS_WEBHOOK_SECRET=...
   ```

   Then one of these, or both:

   ```bash
   supabase secrets set UNISMS_VIRTUAL_NUMBER=+639XXXXXXXXX
   supabase secrets set UNISMS_SENDER_ID=YOURNAME
   ```

2. Deploy both functions. The second is called by UniSMS, which cannot sign
   in, so it is deployed without JWT verification and checks the webhook
   secret instead.

   ```bash
   supabase functions deploy send-sms
   supabase functions deploy sms-inbound --no-verify-jwt
   ```

3. On the Webhooks page of the UniSMS dashboard, put this address in the
   **Virtual Numbers: INCOMING** field:

   ```
   https://<project-ref>.supabase.co/functions/v1/sms-inbound
   ```

   Put the same address in the SMS status webhook too, if you send under a
   sender ID and want a failed delivery to show in the thread.

4. Send one message from the Messages tab to your own phone. It should change
   from "Queued" to "Sent" and arrive. If you have a virtual number, reply to
   it; the reply should appear in the thread within a few seconds.

## How it matches the UniSMS API

Taken from the UniSMS documentation at unismsapi.com/docs:

- Sign-in is HTTP Basic, with the secret key as the user name and no password.
- Sender ID: `POST https://unismsapi.com/api/sms` with `recipient`, `content`
  and `sender_id`. A `201` reply carries `message.reference_id`.
- Virtual number: `POST https://unismsapi.com/api/virtual_numbers/sms` with
  `from`, `to` and `content`.
- A reply arrives as a webhook with `"event": "txt.received"` and the text in
  `message.from` and `message.content`. Delivery results arrive as
  `message.sent` and `message.failed`. Every webhook carries a
  `webhook-secret-key` header.

## What has not been tested

Neither function has run against a live UniSMS account, because there was none
when they were written. They follow the documentation above, so the first real
message in each direction is the test. One thing the documentation does not
show is the reply UniSMS gives when sending from a virtual number; the function
reads it the same way as the sender ID reply, and that is the first place to
look if a sent message stays without a reference.

A failed send is recorded on the message with the reason UniSMS gave, and
shows in the thread as "Not sent".
