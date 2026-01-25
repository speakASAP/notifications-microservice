/**
 * Script to re-parse an email from rawData and update attachments
 * Usage: ts-node scripts/reparse-email.ts <email-id>
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InboundEmailService } from '../src/email/inbound-email.service';
import { WebhookDeliveryService } from '../src/email/webhook-delivery.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InboundEmail } from '../src/email/entities/inbound-email.entity';
import { Repository } from 'typeorm';

async function reparseEmail(emailId: string) {
  console.log(`[REPARSE] Starting re-parse for email ID: ${emailId}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const inboundEmailService = app.get(InboundEmailService);
  const webhookDeliveryService = app.get(WebhookDeliveryService);
  const inboundEmailRepository = app.get<Repository<InboundEmail>>(
    getRepositoryToken(InboundEmail),
  );

  try {
    // Find the email
    const email = await inboundEmailRepository.findOne({
      where: { id: emailId },
    });

    if (!email) {
      console.error(`[REPARSE] ❌ Email not found: ${emailId}`);
      process.exit(1);
    }

    console.log(`[REPARSE] Found email: ${email.from} -> ${email.to}, subject: ${email.subject}`);
    console.log(`[REPARSE] Current attachments: ${email.attachments ? email.attachments.length : 0}`);

    // Check if rawData exists
    if (!email.rawData || !email.rawData.content) {
      console.error(`[REPARSE] ❌ No rawData.content found for email ${emailId}`);
      process.exit(1);
    }

    console.log(`[REPARSE] Re-parsing email from rawData...`);

    // Re-parse the email using the updated code
    const sesNotification = email.rawData;
    const reParsedEmail = await inboundEmailService.parseEmailContent(sesNotification);

    console.log(`[REPARSE] Re-parsed email - attachments: ${reParsedEmail.attachments ? reParsedEmail.attachments.length : 0}`);

    // Update the email in database with new attachments
    email.attachments = reParsedEmail.attachments && reParsedEmail.attachments.length > 0
      ? reParsedEmail.attachments
      : null;

    await inboundEmailRepository.save(email);

    console.log(`[REPARSE] ✅ Updated email in database with ${email.attachments ? email.attachments.length : 0} attachments`);

    // Trigger webhook delivery again
    console.log(`[REPARSE] Triggering webhook delivery...`);
    await webhookDeliveryService.deliverToSubscriptions(email);
    console.log(`[REPARSE] ✅ Webhook delivery triggered`);

    console.log(`[REPARSE] ===== REPARSE COMPLETE =====`);
  } catch (error) {
    console.error(`[REPARSE] ❌ Error: ${error}`);
    if (error instanceof Error) {
      console.error(`[REPARSE] Stack: ${error.stack}`);
    }
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Get email ID from command line
const emailId = process.argv[2];
if (!emailId) {
  console.error('Usage: ts-node scripts/reparse-email.ts <email-id>');
  process.exit(1);
}

reparseEmail(emailId).catch((error) => {
  console.error(`[REPARSE] Fatal error: ${error}`);
  process.exit(1);
});
