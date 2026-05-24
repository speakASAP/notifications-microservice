import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';
import { OrchestratorClient } from './orchestrator.client';
import { TelegramService } from '../telegram/telegram.service';

@Module({
  imports: [HttpModule],
  controllers: [TelegramBotController],
  providers: [TelegramBotService, OrchestratorClient, TelegramService],
})
export class TelegramBotModule {}
