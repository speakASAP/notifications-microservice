/**
 * Process all undelivered emails: from DB (redeliver to helpdesk) and from S3 (fetch, store, webhook).
 * Use after redeploy to catch up. Run on prod: ssh statex 'cd ~/notifications-microservice && npx ts-node scripts/process-all-undelivered.ts'
 *
 * Usage: npx ts-node scripts/process-all-undelivered.ts [dbLimit] [s3MaxKeys]
 * Defaults: dbLimit=5, s3MaxKeys=5
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InboundEmailService } from '../src/email/inbound-email.service';

const DB_LIMIT = Math.min(parseInt(process.argv[2] || '5', 10) || 5, 1000);
const S3_MAX_KEYS = Math.min(parseInt(process.argv[3] || '5', 10) || 5, 1000);

async function run() {
  console.log('[CATCHUP] ===== Process all undelivered (DB + S3) =====');
  console.log(`[CATCHUP] DB limit=${DB_LIMIT}, S3 maxKeys=${S3_MAX_KEYS}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const inboundEmailService = app.get(InboundEmailService);

  try {
    // 1. Inbound emails in DB not yet delivered to helpdesk -> (re)send webhook
    const dbIds = await inboundEmailService.findInboundEmailIdsNotDeliveredToHelpdesk(DB_LIMIT);
    console.log(`[CATCHUP] Found ${dbIds.length} inbound email(s) in DB not delivered to helpdesk`);
    let dbOk = 0;
    let dbFail = 0;
    for (const id of dbIds) {
      try {
        const email = await inboundEmailService.getInboundEmailEntityById(id);
        if (!email) {
          console.warn(`[CATCHUP] DB email ${id} not found, skip`);
          continue;
        }
        await inboundEmailService.processInboundEmail(email);
        dbOk += 1;
      } catch (err) {
        dbFail += 1;
        console.error(`[CATCHUP] DB redeliver failed ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`[CATCHUP] DB redeliver done: ok=${dbOk}, fail=${dbFail}`);

    // 2. S3 objects not in DB -> process each (store + webhook)
    const s3Data = await inboundEmailService.findUnprocessedS3Keys({ maxKeys: S3_MAX_KEYS });
    const { bucket, unprocessed } = s3Data;
    console.log(`[CATCHUP] Found ${unprocessed.length} unprocessed S3 key(s) in bucket=${bucket}`);
    let s3Ok = 0;
    let s3Fail = 0;
    for (const item of unprocessed) {
      try {
        await inboundEmailService.processEmailFromS3(bucket, item.key);
        s3Ok += 1;
      } catch (err) {
        s3Fail += 1;
        console.error(`[CATCHUP] S3 process failed ${item.key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`[CATCHUP] S3 process done: ok=${s3Ok}, fail=${s3Fail}`);

    console.log('[CATCHUP] ===== Process all undelivered END =====');
  } catch (error) {
    console.error('[CATCHUP] Fatal:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

run();
