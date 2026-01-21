# Email Attachments Storage and Transfer Analysis

## Summary

This document analyzes how email attachments are stored in the database and sent to speakasap-portal via webhooks.

## Storage Format

### Database Storage

**Location**: `inbound_emails.attachments` column (JSONB type)

**Format**:

```json
[
  {
    "filename": "document.pdf",
    "contentType": "application/pdf",
    "content": "<raw string content from email parsing>"
  }
]
```

**Storage Details**:

- **Column Type**: `jsonb` (PostgreSQL JSONB)
- **PostgreSQL Limits**:
  - **Overall JSONB value**: ~1 GB maximum (2³⁰ − 1 bytes = 1,073,741,823 bytes)
  - **Individual string within JSONB**: ~256 MB maximum (268,435,455 bytes)
  - Large values are automatically TOASTed (compressed and stored in secondary table)

**Important**: Attachments are stored as **raw string content** (decoded from email's Content-Transfer-Encoding) in the database JSONB field. This means:

- If attachment was base64-encoded in email → stored as decoded binary content (as string)
- If attachment was quoted-printable → stored as decoded content
- The content is stored directly, not base64-encoded again

### Example from Production Database

```json
{
  "content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
  "filename": "PVPOJ_2024-12.xml",
  "contentType": "text/xml"
}
```

## Transfer Format

### Webhook Payload

**Location**: `ProcessedEmailPayload.attachments[]` in webhook to speakasap-portal

**Format**:

```typescript
{
  filename: string;
  contentType: string;
  size: number; // bytes
  content: string; // Base64 encoded
}
```

**Conversion Process** (`webhook-delivery.service.ts:216-256`):

1. **Read from database**: Attachment stored as raw string content
2. **Convert to base64**:

   ```typescript
   base64Content = Buffer.from(attachment.content, 'utf-8').toString('base64');
   ```

3. **Calculate size**: Original size in bytes
4. **Send in payload**: Base64-encoded string

**Important**: Content is **re-encoded to base64** when sending to webhook, even if it was already decoded from the email.

## Size Considerations

### Storage Sizes

1. **In Database (JSONB)**:
   - Stored as raw decoded content (string)
   - PostgreSQL automatically compresses large JSONB values (TOAST)
   - Maximum per attachment string: ~256 MB
   - Maximum total JSONB value: ~1 GB

2. **In Webhook Payload (JSON)**:
   - Base64-encoded (increases size by ~33%)
   - All attachments included in single JSON payload
   - Webhook timeout: **20 seconds** (line 157)
   - No explicit size limit, but practical limits:
     - HTTP request size limits
     - JSON parsing time
     - Network transfer time

### Practical Limits

**Based on code analysis**:

| Stage | Limit | Notes |
|-------|-------|-------|
| Database (JSONB string) | ~256 MB per attachment | PostgreSQL hard limit |
| Database (JSONB total) | ~1 GB total | All attachments combined |
| Webhook timeout | 20 seconds | HTTP request timeout |
| Webhook payload | No explicit limit | But must complete in <20s |

**Recommendation**:

- Small attachments (<10 MB): ✅ Works fine
- Medium attachments (10-50 MB): ⚠️ May be slow, but should work
- Large attachments (>50 MB): ⚠️ Risk of timeout or payload size issues
- Very large attachments (>256 MB): ❌ Will fail at database storage

## Data Flow

```text
AWS SES Email with Attachment
  ↓
1. Parse MIME email content
   - Extract attachment part
   - Decode Content-Transfer-Encoding (base64/quoted-printable)
   - Store as raw string in memory
  ↓
2. Store in Database (inbound_emails.attachments)
   - Store as JSONB array
   - Content stored as raw string (decoded)
   - PostgreSQL TOASTs large values automatically
  ↓
3. Prepare Webhook Payload
   - Read attachment from database (raw string)
   - Re-encode to base64
   - Add size metadata
   - Include in JSON payload
  ↓
4. Send to speakasap-portal
   - POST request with JSON payload
   - All attachments base64-encoded in payload
   - 20 second timeout
  ↓
5. speakasap-portal receives
   - Decodes base64 content
   - Creates MailAttachment objects
   - Stores in file storage
```

## Potential Issues

### 1. Double Encoding

**Issue**: Attachments are:

1. Decoded from email (base64 → raw)
2. Stored as raw string in database
3. Re-encoded to base64 for webhook

**Impact**:

- ✅ Not a problem functionally
- ⚠️ Slightly inefficient (base64 encoding happens twice)

### 2. Large Attachment Handling

**Issue**: Large attachments (>50 MB) may:

- Cause webhook timeout (20 seconds)
- Create very large JSON payloads
- Slow down database operations

**Current Mitigation**:

- PostgreSQL TOAST compresses large JSONB values
- But webhook still needs to encode and send full size

### 3. Memory Usage

**Issue**: Large attachments are loaded into memory:

1. When parsing email (full content in memory)
2. When preparing webhook payload (full content encoded)

**Impact**: High memory usage for large attachments

## Recommendations

### Option 1: Keep Current Approach (Simple)

**Pros**:

- Simple implementation
- All data in database
- Easy to query and recover

**Cons**:

- Large attachments may cause issues
- Memory intensive
- Webhook payload size grows linearly

### Option 2: Store Attachments Separately (Recommended for Large Files)

**Implementation**:

1. Store attachments in file storage (S3, local filesystem)
2. Store only metadata + file path in JSONB
3. Send file URL or reference in webhook payload

**Benefits**:

- Handles very large files
- Smaller database and webhook payloads
- Better performance

**Cons**:

- More complex implementation
- Requires file storage infrastructure
- Need to manage file lifecycle

### Option 3: Streaming/Chunking for Large Attachments

**Implementation**:

1. Detect large attachments (>10 MB)
2. Send separately or in chunks
3. Use separate endpoint for large files

**Benefits**:

- Handles large files
- Doesn't block webhook delivery

**Cons**:

- Complex implementation
- Requires additional endpoints

## Code References

### Storage

- **Entity**: `notifications-microservice/src/email/entities/inbound-email.entity.ts:52-56`
- **Parsing**: `notifications-microservice/src/email/inbound-email.service.ts:357-362`
- **Interface**: `notifications-microservice/src/email/inbound-email.service.ts:45-49`

### Transfer

- **Webhook Payload**: `notifications-microservice/src/email/webhook-delivery.service.ts:216-256`
- **Interface**: `notifications-microservice/src/email/webhook-delivery.service.ts:31-36`

### Reception

- **speakasap-portal**: `speakasap-portal/helpdesk/views.py:678-694`
