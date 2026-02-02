/**
 * Scheduler: process unprocessed S3 inbound emails and send to helpdesk.
 * Runs every few minutes; if GET /email/inbound/s3-unprocessed would return >0,
 * fetches those keys and processes each (store + webhook to helpdesk).
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '../../shared/logger/logger.service';
import { InboundEmailService } from './inbound-email.service';

/** Max S3 keys to process per run (align with "max 30 small items" constraint). */
const MAX_KEYS_PER_RUN = 30;

/** Cron: every 5 minutes. */
const CRON_EXPRESSION = '*/5 * * * *';

@Injectable()
export class S3UnprocessedCatchupScheduler {
  constructor(
    private readonly inboundEmailService: InboundEmailService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CRON_EXPRESSION)
  async handleCatchup(): Promise<void> {
    try {
      const data = await this.inboundEmailService.findUnprocessedS3Keys({
        maxKeys: MAX_KEYS_PER_RUN,
      });
      const { bucket, unprocessed } = data;
      if (!unprocessed.length) {
        return;
      }
      this.logger.log(
        `[S3_CATCHUP] Found ${unprocessed.length} unprocessed S3 keys, processing (max ${MAX_KEYS_PER_RUN} per run)`,
        'S3UnprocessedCatchupScheduler',
      );
      let ok = 0;
      let fail = 0;
      for (const item of unprocessed) {
        try {
          await this.inboundEmailService.processEmailFromS3(bucket, item.key);
          ok += 1;
          this.logger.log(
            `[S3_CATCHUP] Processed key=${item.key} -> helpdesk`,
            'S3UnprocessedCatchupScheduler',
          );
        } catch (err) {
          fail += 1;
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[S3_CATCHUP] Failed key=${item.key}: ${msg}`,
            'S3UnprocessedCatchupScheduler',
          );
        }
      }
      this.logger.log(
        `[S3_CATCHUP] Run finished: ok=${ok}, fail=${fail}`,
        'S3UnprocessedCatchupScheduler',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[S3_CATCHUP] Catchup failed: ${msg}`,
        err instanceof Error ? err.stack : undefined,
        'S3UnprocessedCatchupScheduler',
      );
    }
  }
}
