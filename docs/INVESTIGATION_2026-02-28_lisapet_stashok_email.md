# Investigation: Email not delivered to helpdesk (28 Feb 2026)

**Email:** Date Sat, 28 Feb 2026 19:25:27 +0200 | From: SSF &lt;<lisapet@ukr.net>&gt; | To: <stashok@speakasap.com> | Message-Id: `1772299527.0493579000.d2juj2p5@frv63.fwdcdn.com`

**Conclusion:** The email was **not** in the notifications-microservice database and was **not** sent to the speakasap-portal helpdesk. It never reached the notifications service.

---

## Checks performed

### On statex (notifications-microservice)

1. **Trace script**  
   `./scripts/trace-email-with-attachments.sh stashok@speakasap.com 1772299527.0493579000.d2juj2p5@frv63.fwdcdn.com`  
   - DB check skipped (psql not available in that environment).  
   - No matching log lines for this messageId.

2. **API GET /email/inbound?limit=20&toFilter=@speakasap.com**  
   - Returned 3 recent emails; **none** from <lisapet@ukr.net> to <stashok@speakasap.com>.  
   - No inbound to stashok in the first 50 results.

3. **Webhook subscriptions**  
   - Helpdesk: active, `filters.to = ["*@speakasap.com"]`, lastDeliveryAt 2026-02-28T17:28:01Z.  
   - Configuration is correct; emails to *@speakasap.com would be delivered if they were in the DB.

4. **Undelivered list**  
   - 3 entries (other emails); none for this messageId.

5. **Container logs**  
   - No lines containing 1772299527, lisapet, or S3/inbound for this email around 17:25 UTC.

### On speakasap (speakasap-portal)

1. **helpdesk.log**  
   - Path: `speakasap-portal/logs/helpdesk.log` (or under /home/portal_db); file was **empty** (0 bytes).  
   - No webhook received for this email.

---

## Root cause

The email **never reached notifications-microservice**. The pipeline break is **before** the service:

- Either **AWS SES did not receive** this message (e.g. <stashok@speakasap.com> not received via SES, or different MX/forwarding),
- Or **SES did not store it in S3** (receiving rule / S3 action),
- Or **S3 event → SNS → POST /email/inbound/s3** did not run for this object (event not configured, or SNS not confirmed).

The `Received: from lisapet@ukr.net by frv63.fwdcdn.com` header suggests the message passed through a forwarder (e.g. frv63.fwdcdn.com); the final delivery to <stashok@speakasap.com> may not go through AWS SES.

---

## Recommended next steps

1. **Confirm how <stashok@speakasap.com> receives mail**  
   - If it is only via AWS SES → S3 → notifications-microservice: check SES receiving rule and that the address is a recipient.  
   - If there is another MX or forwarding (e.g. frv63.fwdcdn.com): that path may not be writing to the same S3 bucket or at all.

2. **Check AWS S3**  
   - In bucket `AWS_SES_S3_BUCKET` (e.g. speakasap-email-forward), prefix `forwards/`, look for an object created around **2026-02-28 17:25–17:26 UTC** (e.g. by messageId or timestamp).  
   - If the object **exists**: S3 event or SNS is likely the issue; process it manually:

     ```bash
     source ~/notifications-microservice/.env
     curl -s -X POST "https://notifications.statex.cz/email/inbound/s3" \
       -H "Authorization: Bearer $SERVICE_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"bucket":"speakasap-email-forward","key":"forwards/<OBJECT_KEY>"}'
     ```

   - If the object **does not exist**: SES is not saving this message to S3; fix the SES receiving rule or the path by which mail reaches SES.

3. **Run S3 catchup** (if you use the scheduled job)  
   - Ensures any recent S3 objects that were not processed (e.g. due to missed events) get ingested.  
   - Or run: `npx ts-node scripts/process-all-undelivered.ts` (see scripts README).

4. **Optional: fix trace script DB check on statex**  
   - The trace script could not run the DB query (psql not available).  
   - On statex, either install psql in the environment that runs the script or run the same query via another DB client (e.g. from a container that has psql and env).

---

*Investigation run: 28 Feb 2026.*
