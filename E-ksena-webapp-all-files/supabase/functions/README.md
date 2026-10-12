# Connecting SMS (PhilSMS)

The Messages tab already saves every message a responder writes. These two
functions are what turn a saved message into a real text, and a reply into a
line in the thread. Nothing in the dashboard has to change to switch it on.

Until this is done, messages stay marked "Queued, not sent yet" and the
dashboard shows that SMS is not connected.

## What you need first

- The tables: run `supabase/sms-messages.sql` in the Supabase SQL Editor.
- A PhilSMS account, with an API token and an approved sender ID.
- The Supabase CLI, signed in and linked to the project.

## Steps

1. Store the secrets. The token must never go in the web app or the repo.

   ```bash
   supabase secrets set PHILSMS_API_TOKEN=... PHILSMS_SENDER_ID=... SMS_INBOUND_SECRET=...
   ```

   `SMS_INBOUND_SECRET` is any long random string you make up.

2. Deploy both functions. The inbound one is called by PhilSMS, which cannot
   sign in, so it is deployed without JWT verification and checks the secret
   in its address instead.

   ```bash
   supabase functions deploy send-sms
   supabase functions deploy sms-inbound --no-verify-jwt
   ```

3. In the PhilSMS dashboard, set the webhook for incoming messages to:

   ```
   https://<project-ref>.supabase.co/functions/v1/sms-inbound?key=<SMS_INBOUND_SECRET>
   ```

4. Send one message from the Messages tab to your own phone. It should change
   from "Queued" to "Sent" and arrive. Reply to it; the reply should appear in
   the thread.

## What has not been tested

Neither function has run against a live PhilSMS account, because there was
none when they were written.

- `send-sms` uses the PhilSMS v3 format: a POST to
  `https://app.philsms.com/api/v3/sms/send` with `recipient`, `sender_id`,
  `type` and `message`. If PhilSMS documents a different address, set
  `PHILSMS_API_URL`; if the fields differ, they are in one place in the file.
- `sms-inbound` does not know the field names PhilSMS uses for incoming
  messages, so it accepts the usual ones. Confirm that PhilSMS offers incoming
  messages on your plan, look at the first real reply, and adjust the two lists
  at the top of the file.

A failed send is recorded on the message with the reason PhilSMS gave, and
shows in the thread as "Not sent".
