/**
 * Script to manually process an email from S3 bucket
 * Usage: ts-node scripts/process-s3-email.ts <bucket-name> <object-key>
 * Example: ts-node scripts/process-s3-email.ts speakasap-email-forward forwards/3o1q7pqbgd4ivqh2281gqcqgugar5jtai0bo3fo1
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InboundEmailService } from '../src/email/inbound-email.service';

async function processS3Email(bucketName: string, objectKey: string) {
  console.log(`[S3_PROCESS] Starting processing for S3 email`);
  console.log(`[S3_PROCESS] Bucket: ${bucketName}`);
  console.log(`[S3_PROCESS] Key: ${objectKey}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const inboundEmailService = app.get(InboundEmailService);

  try {
    const result = await inboundEmailService.processEmailFromS3(bucketName, objectKey);
    console.log(`[S3_PROCESS] ✅ Successfully processed email`);
    console.log(`[S3_PROCESS] Email ID: ${result.id}`);
    console.log(`[S3_PROCESS] Attachments: ${result.attachmentsCount}`);
    console.log(`[S3_PROCESS] ===== PROCESS COMPLETE =====`);
  } catch (error) {
    console.error(`[S3_PROCESS] ❌ Error: ${error}`);
    if (error instanceof Error) {
      console.error(`[S3_PROCESS] Stack: ${error.stack}`);
    }
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Get bucket and key from command line
const bucketName = process.argv[2];
const objectKey = process.argv[3];

if (!bucketName || !objectKey) {
  console.error('Usage: ts-node scripts/process-s3-email.ts <bucket-name> <object-key>');
  console.error('Example: ts-node scripts/process-s3-email.ts speakasap-email-forward forwards/3o1q7pqbgd4ivqh2281gqcqgugar5jtai0bo3fo1');
  process.exit(1);
}

processS3Email(bucketName, objectKey).catch((error) => {
  console.error(`[S3_PROCESS] Fatal error: ${error}`);
  process.exit(1);
});
