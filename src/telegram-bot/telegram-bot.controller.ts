import { Controller, Post, Body, Res, Logger, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/roles.decorator';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramUpdate } from './dto/telegram-update.dto';

@Controller('telegram')
export class TelegramBotController {
  private readonly logger = new Logger(TelegramBotController.name);

  constructor(private readonly botService: TelegramBotService) {}

  @Public()
  @Post('webhook')
  async handleWebhook(@Body() update: TelegramUpdate, @Res() res: Response): Promise<void> {
    const chatId =
      update.message?.chat?.id ?? update.callback_query?.from?.id;

    if (chatId !== undefined && !this.botService.isAuthorized(chatId)) {
      this.logger.warn(`Rejected Telegram update from unauthorized chat_id: ${chatId}`);
      // Return 200 to Telegram to prevent retries, but do nothing
      res.sendStatus(200);
      return;
    }

    // Fire-and-forget; always return 200 immediately so Telegram doesn't retry
    this.botService.handleUpdate(update).catch((err) =>
      this.logger.error('Unhandled error in handleUpdate', err),
    );
    res.sendStatus(200);
  }
}
