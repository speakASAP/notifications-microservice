/**
 * Scheduler: process unprocessed S3 inbound emails and send to helpdesk.
 * Runs every few minutes; if GET /email/inbound/s3-unprocessed would return >0,
 * fetches those keys and processes each (store + webhook to helpdesk).
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '../../shared/logger/logger.service';
import { InboundEmailService } from './inbound-email.service';

/** Default: 10. Override via S3_CATCHUP_MAX_KEYS_PER_RUN in .env (max 100). */
const DEFAULT_MAX_KEYS = 10;

/** Default: every 5 minutes. Override via S3_CATCHUP_CRON in .env. */
const DEFAULT_CRON = '*/5 * * * *';

function getMaxKeysPerRun(): number {
  const raw = process.env.S3_CATCHUP_MAX_KEYS_PER_RUN;
  if (raw == null || raw === '') return DEFAULT_MAX_KEYS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_MAX_KEYS;
  return Math.min(n, 100);
}

@Injectable()
export class S3UnprocessedCatchupScheduler {
  constructor(
    private readonly inboundEmailService: InboundEmailService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(process.env.S3_CATCHUP_CRON ?? DEFAULT_CRON)
  async handleCatchup(): Promise<void> {
    const maxKeysPerRun = getMaxKeysPerRun();
    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const data = await this.inboundEmailService.findUnprocessedS3Keys({
        maxKeys: maxKeysPerRun,
        sinceDate,
      });
      const { bucket, unprocessed } = data;
      if (!unprocessed.length) {
        return;
      }
      this.logger.log(
        `[S3_CATCHUP] Found ${unprocessed.length} unprocessed S3 keys (last 24h), processing (max ${maxKeysPerRun} per run)`,
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
