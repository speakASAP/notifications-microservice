# Inbound Email Body With Attachments Fix Plan

## Goal

Ensure helpdesk receives non-empty body text for emails with attachments by preserving raw MIME content from S3.

## Plan and Status

- ✅ Review inbound email parsing and webhook flow in notifications-microservice
- ✅ Confirm attachment emails use S3 flow and can miss rawContentBase64 in webhook payload
- ✅ Store raw MIME (base64) when S3 fetch is used and SES notification lacks content
- ✅ **Root cause:** Fix `section.endsWith('--')` skip in `parseMultipart` – nested multipart (multipart/alternative) sections end with `--nestedBoundary--`; we were skipping them, so body was never extracted when email had attachments (multipart/mixed with alternative + attachments).
- ✅ Validate delivery logs and document helpdesk delivery status

## Notes

- The helpdesk webhook can recover body from `rawContentBase64` when parsed body is empty or corrupted.
- This update ensures S3-fetched emails include `rawContentBase64` in webhook payload.
- **Empty body with attachments:** Caused by skipping any section ending with `--`. Now we only skip empty sections or the exact `--` fragment; nested multipart sections are processed and body (text/plain, text/html) is extracted.

- **Email decode corruption (blue ?, garbled text):** Root cause was using `utf-8` when decoding raw MIME from base64. Raw MIME contains binary/non-UTF8 bytes; utf-8 replaces invalid sequences with U+FFFD. Fixed by using `latin1` (preserves all bytes). Also: (1) decodeContent now uses Content-Type charset (e.g. windows-1251) via iconv-lite; (2) quoted-printable regular-char handling uses charCodeAt (content from latin1, char=byte); (3) helpdesk async task uses rawContentBase64 recovery when body is corrupted; (4) extract_body_from_raw_mime uses latin1 + cp1251 fallback for Russian emails.
