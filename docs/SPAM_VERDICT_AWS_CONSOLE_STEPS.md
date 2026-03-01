# Step-by-step: Use AWS built-in spam verdict in the console

This guide walks you through enabling AWS SES’s built-in spam (and virus/SPF/DKIM) verdict so that failing messages are dropped **before** they are saved to S3. Use the **same AWS Region** as your SES inbound (e.g. **eu-central-1** from `AWS_SES_REGION`).

---

## Step 1: Create the Lambda function

1. Open **AWS Console**: <https://console.aws.amazon.com/>
2. Set **Region** (top-right) to **eu-central-1** (or your `AWS_SES_REGION`).
3. In the top search bar, type **Lambda** and open **Lambda**.
4. Click **Create function**.
5. **Author from scratch**:
   - **Function name:** e.g. `ses-inbound-drop-spam`
   - **Runtime:** **Node.js 20.x**, 18.x, or 24.x (for 24.x use the async/return handler below; callbacks are not supported in Node.js 24+)
   - **Architecture:** x86_64
6. Under **Permissions**, leave **Create a new role with basic Lambda permissions**.
7. Click **Create function**.

---

## Step 2: Paste the handler code

1. On the function page, open the **Code** tab.
2. Replace the default code in `index.mjs` (or `index.js`) with:

```javascript
export const handler = async (event) => {
    console.log('SES inbound spam filter');

    const sesNotification = event?.Records?.[0]?.ses;
    if (!sesNotification) {
        console.warn('Invalid event: missing Records[0].ses, continuing');
        return { disposition: 'CONTINUE' };
    }
    console.log('SES Notification:', JSON.stringify(sesNotification, null, 2));

    const receipt = sesNotification.receipt || {};
    const spf = receipt.spfVerdict?.status === 'FAIL';
    const dkim = receipt.dkimVerdict?.status === 'FAIL';
    const spam = receipt.spamVerdict?.status === 'FAIL';
    const virus = receipt.virusVerdict?.status === 'FAIL';

    if (spf || dkim || spam || virus) {
        console.log('Dropping message (spf:', spf, 'dkim:', dkim, 'spam:', spam, 'virus:', virus, ')');
        const result = { disposition: 'STOP_RULE_SET' };
        console.log('Returning disposition:', result);
        return result;
    }
    const result = { disposition: 'CONTINUE' };
    console.log('Returning disposition:', result);
    return result;
};
```

**Node.js 24+:** Lambda no longer supports callback-based handlers. Use the above async handler that **returns** the disposition object (no `callback`). Works on Node.js 18, 20, and 24.

The `console.log('Returning disposition:', result)` lines let you see `CONTINUE` or `STOP_RULE_SET` in CloudWatch (Lambda logs); Lambda does not log the return value by default.

1. Click **Deploy** (top right of the code editor).

**Lambda Test tab — use this event:** In **Test** → create/edit test event, set **Event JSON** to the following so `Records[0].ses` exists (otherwise you get "Cannot read properties of undefined (reading '0')"):

```json
{
  "Records": [
    {
      "eventSource": "aws:ses",
      "eventVersion": "1.0",
      "ses": {
        "mail": {
          "messageId": "test-msg-1",
          "source": "sender@example.com",
          "destination": ["you@speakasap.com"]
        },
        "receipt": {
          "spamVerdict": { "status": "PASS" },
          "virusVerdict": { "status": "PASS" },
          "spfVerdict": { "status": "PASS" },
          "dkimVerdict": { "status": "PASS" }
        }
      }
    }
  ]
}
```

Expected test result: **Status: Succeeded**, response `{ "disposition": "CONTINUE" }`. To test drop: change one verdict to `"status": "FAIL"` and you should get `{ "disposition": "STOP_RULE_SET" }`.

---

## Step 3: Let SES invoke the Lambda (resource policy)

1. In the Lambda function page, open the **Configuration** tab.
2. In the left sidebar, click **Permissions**.
3. Under **Resource-based policy statements**, click **Add permissions**.
4. Fill in:
   - **Statement ID:** e.g. `AllowSESInvoke`
   - **Principal:** `ses.amazonaws.com`
   - **Action:** `lambda:InvokeFunction`
   - **Source ARN:** (optional) you can leave blank for now; or after Step 5 you can set it to your receipt rule ARN for tighter security.
5. Click **Save**.

**Alternative:** When you add this Lambda to the SES receipt rule (Step 5), the console may offer to add this resource policy for you — if you see that dialog, accept it and you can skip this step.

---

## Step 4: Open SES Email Receiving and find your rule

1. In the AWS Console search bar, type **SES** and open **Amazon Simple Email Service**.
2. In the **left navigation**, under **Configuration**, click **Email receiving** (in some UIs this is **Receipt rules**).
3. Under the **Receipt rule sets** tab you will see your rule set(s). The one marked **Active** is in use.
4. Click the **name** of the active rule set to open it.
5. You will see a list of **receipt rules**. Identify the rule that has **S3** and/or **SNS** actions (the one that saves mail to your bucket and notifies your webhook). You will edit this rule in the next step.

---

## Step 5: Edit the receipt rule — enable scanning and add Lambda first

1. Select the receipt rule (checkbox) and click **Edit** (or click the rule name, then **Edit**).
2. **First page — Define rule settings:**
   - Find **Spam and virus scanning** and set it to **Enabled**. This is required so `spamVerdict` and `virusVerdict` are sent to Lambda.
   - Click **Next** until you reach the step where **actions** are listed (e.g. **Add actions**).
3. **Add the Lambda action:**
   - Click **Add new action**.
   - In the action type dropdown, choose **Invoke Lambda function**.
   - **Lambda function:** select your function `ses-inbound-drop-spam` from the list, or paste its ARN (Lambda → Functions → your function → copy ARN).
   - **Invocation type:** choose **RequestResponse** (synchronous). This is required so SES can use the returned `disposition` to stop the rule set.
   - If the console asks “The following permission will be added to your Lambda function’s resource policy…”, click **Add permission** (or **Yes**).
4. **Order of actions (critical):**
   - Use the **up/down arrows** next to each action so that **Invoke Lambda function** is **first**.
   - Target order: **1. Invoke Lambda function** → **2. Deliver to S3 bucket** → **3. Publish to SNS topic** (if you have SNS). When Lambda returns `STOP_RULE_SET`, actions 2 and 3 are not run.
5. Click **Next** (or **Save** / **Update rule**) and confirm.

---

## Step 6: Verify

1. In **SES** → **Email receiving** → your rule set → your rule, confirm:
   - **Spam and virus scanning** is **Enabled**.
   - Actions order: **Invoke Lambda function** first, then **Deliver to S3 bucket**, then **Publish to SNS topic** (if present).
2. Send a test spammy email to your receiving address (or wait for real spam). In **Lambda** → your function → **Monitor** → **View CloudWatch logs**, you should see invocations and, for dropped messages, the log line “Dropping message (spf: … dkim: … spam: … virus: …)”.

---

## Menu summary

| Goal | Where to click |
|------|----------------|
| Create Lambda | **AWS Console** → search **Lambda** → **Create function** |
| SES receipt rules | **AWS Console** → search **SES** → **Configuration** → **Email receiving** → **Receipt rule sets** |
| Edit rule | Open active rule set → select the rule that has S3/SNS → **Edit** → **Add actions** → add **Invoke Lambda function** and put it **first** |

**If you see "Log group does not exist"** for `/aws/lambda/ses-inbound-drop-spam`: the log group is created on the **first invocation**. Run the function once via Lambda → **Test** tab (use a test event with `Records[0].ses.receipt` and verdicts); after that the log group appears in CloudWatch in the same region.

---

## What the Lambda does

- SES invokes the Lambda with the inbound email event (metadata and verdicts, no body).
- The Lambda reads `receipt.spamVerdict`, `virusVerdict`, `spfVerdict`, `dkimVerdict`.
- If **any** of these is `status === 'FAIL'`, it returns `disposition: 'STOP_RULE_SET'` and SES drops the message (no S3, no SNS).
- Otherwise it returns `disposition: 'CONTINUE'` and SES continues with the next actions (S3, then SNS).

See also: [SPAM_REPORTING_AND_FILTERING.md](SPAM_REPORTING_AND_FILTERING.md).
