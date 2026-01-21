# Email Integrity Analysis

## Summary

This document analyzes how emails from AWS SES are stored and transferred to ensure original email content is preserved without modification.

## Current State

### ✅ What's Working

1. **Raw Content Storage**:
   - Original MIME content from AWS SES is **preserved unchanged** in `inbound_emails.rawData.content` as base64
   - All emails checked show `has_raw_content = YES` with original content length preserved
   - This is the **single source of truth** for original email content

2. **Database Schema**:
   - `bodyText`: Parsed plain text body
   - `bodyHtml`: Parsed HTML body (or generated from plain text)
   - `rawData.content`: Original base64-encoded MIME from SES (untouched)
   - `attachments`: Parsed attachments array

3. **Email Parsing**:
   - Properly decodes base64 email content from SES
   - Handles multipart messages with boundaries
   - Decodes quoted-printable and base64 transfer encodings
   - Extracts HTML and plain text parts

### ⚠️ Potential Issues

1. **Parsed Content Usage**:
   - `speakasap-portal` **only uses** `bodyHtml` or `bodyText` from the webhook payload
   - `rawContentBase64` is included in payload but **never used** by speakasap-portal
   - If parsing fails or corrupts content, corrupted version is what gets displayed

2. **HTML Generation**:
   - When email has only plain text (no HTML), code generates HTML by replacing `\n` with `<br>` (line 234 in `inbound-email.service.ts`)
   - This is a **modification** of original content, though arguably benign

3. **No Fallback Mechanism**:
   - If parsed `bodyHtml`/`bodyText` is corrupted or empty, there's no automatic fallback to `rawContentBase64`
   - speakasap-portal should check for corrupted content and use raw content as fallback

## Data Flow

```text
AWS SES → notifications-microservice
  ↓
1. Receive SNS notification with base64 MIME content
  ↓
2. Decode base64 → raw email string
  ↓
3. Parse MIME:
   - Extract headers (Subject, From, To)
   - Parse multipart boundaries
   - Decode Content-Transfer-Encoding (quoted-printable, base64)
   - Extract bodyText and bodyHtml parts
   ↓
4. Store in database:
   - bodyText: parsed plain text
   - bodyHtml: parsed HTML (or generated from plain text)
   - rawData.content: ORIGINAL base64 MIME (preserved unchanged)
  ↓
5. Send webhook to speakasap-portal:
   - bodyText: parsed plain text
   - bodyHtml: parsed HTML
   - rawContentBase64: original base64 MIME (included but not used)
  ↓
6. speakasap-portal:
   - Uses bodyHtml or bodyText directly
   - Stores in ticket.body field
   - DISPLAYS in helpdesk interface
```

## Verification Results

### Production Database Check

```sql
-- Checked 5 recent emails:
- All have rawData.content preserved (YES)
- Raw content length: 5000-80000 bytes (reasonable)
- bodyHtml and bodyText are parsed correctly for most emails
```

### Code Analysis

1. **Storage** (`inbound-email.service.ts:714-731`):
   - ✅ Raw data stored in `rawData` field (entire SES notification)
   - ✅ Original base64 content in `rawData.content` is never modified

2. **Transfer** (`webhook-delivery.service.ts:216-285`):
   - ✅ `rawContentBase64` is included in payload when available
   - ⚠️ But speakasap-portal doesn't use it

3. **Reception** (`speakasap-portal/helpdesk/views.py:625-656`):
   - ⚠️ Only uses `bodyHtml` or `bodyText`
   - ❌ Never checks or uses `rawContentBase64`

## Recommendation

### Use Raw Content Directly (Most Reliable)

Modify speakasap-portal to:

1. Always prefer `rawContentBase64` if available
2. Decode and extract HTML body on speakasap-portal side
3. Only fallback to `bodyHtml`/`bodyText` if raw content unavailable

## Next Steps

1. ✅ Verify raw content is stored (DONE)
2. ✅ Verify raw content is transferred (DONE)
3. ⚠️ Check specific corrupted emails from screenshots (tickets 219674, 219655)
4. ✅ Add fallback mechanism in speakasap-portal (IMPLEMENTED)
5. ⚠️ Improve parsing error detection and logging

## Implementation

### Fallback Mechanism Added (✅ COMPLETED)

**Location**: `speakasap-portal/helpdesk/views.py`

**Changes**:

1. Added `is_content_corrupted()` function to detect corrupted email bodies:
   - Detects base64 strings (long alphanumeric without HTML tags)
   - Detects only punctuation/special characters
   - Detects suspicious patterns (e.g., "--Mail Android", ",!,", etc.)
   - Detects very short content (< 10 chars)

2. Added `extract_body_from_raw_mime()` function to extract body from raw MIME:
   - Decodes base64 raw content
   - Parses multipart MIME messages
   - Extracts HTML and plain text parts
   - Handles quoted-printable decoding
   - Falls back gracefully on errorsw

3. Modified `_process_email_data()` to use fallback:
   - Checks if parsed body is corrupted using `is_content_corrupted()`
   - If corrupted, extracts body from `rawContentBase64` using `extract_body_from_raw_mime()`
   - Logs all recovery attempts for debugging
   - Falls back to subject if all else fails

**How it works**:

1. Webhook receives email payload with `bodyHtml`, `bodyText`, and `rawContentBase64`
2. System tries to use `bodyHtml` or `bodyText` first
3. If content looks corrupted, automatically extracts from `rawContentBase64`
4. Original MIME is parsed on speakasap-portal side as fallback
5. All actions are logged for monitoring and debugging

**Benefits**:

- ✅ Preserves original email content even when parsing fails
- ✅ Automatic recovery without manual intervention
- ✅ Comprehensive logging for troubleshooting
- ✅ Graceful degradation (falls back to subject if needed)

## Evidence

### Screenshots Show

- **Ticket 219674**: Shows corrupted text like `,!,,`, `--Mail Android`
- **Ticket 219655**: Shows long base64 string being displayed

### This suggests

- Either parsing failed for these specific emails
- Or base64 content wasn't properly decoded
- Or HTML structure was mangled during parsing

### Need to investigate

- Specific email IDs for tickets 219674 and 219655
- Check their `bodyHtml` content in database
- Compare with `rawData.content` to see what went wrong
