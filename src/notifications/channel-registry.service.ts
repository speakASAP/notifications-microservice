import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../shared/logger/logger.service';
import { EmailProvider, NotificationChannel, SendNotificationDto } from './dto/send-notification.dto';
import { ChannelRegistry } from './entities/channel-registry.entity';

export interface ResolvedSendPolicy {
  dto: SendNotificationDto;
  decisionReason: string;
}

@Injectable()
export class ChannelRegistryService {
  constructor(
    @InjectRepository(ChannelRegistry)
    private readonly channelRegistryRepository: Repository<ChannelRegistry>,
    private readonly logger: LoggerService,
  ) {}

  private mapRegistryTypeToChannel(type: ChannelRegistry['type']): NotificationChannel {
    switch (type) {
      case 'email':
        return NotificationChannel.EMAIL;
      case 'telegram':
        return NotificationChannel.TELEGRAM;
      case 'whatsapp':
        return NotificationChannel.WHATSAPP;
      case 'sms':
        return NotificationChannel.SMS;
      default:
        throw new BadRequestException(`Unsupported channel type in registry: ${type}`);
    }
  }

  private mapRegistryProviderToEmailProvider(provider: ChannelRegistry['provider']): EmailProvider | undefined {
    if (provider === 'ses') {
      return EmailProvider.SES;
    }
    if (provider === 'sendgrid') {
      return EmailProvider.SENDGRID;
    }
    return undefined;
  }

  async resolveSendPolicy(sendDto: SendNotificationDto): Promise<ResolvedSendPolicy> {
    if (!sendDto.channelKey) {
      if (!sendDto.channel) {
        throw new BadRequestException('channel is required when channelKey is omitted');
      }
      return {
        dto: sendDto,
        decisionReason: 'legacy_fallback_no_channel_key',
      };
    }

    const channel = await this.channelRegistryRepository.findOne({
      where: { channelKey: sendDto.channelKey },
    });
    if (!channel) {
      throw new NotFoundException(`Channel key not found: ${sendDto.channelKey}`);
    }
    if (!channel.isActive) {
      throw new BadRequestException(`Channel key is inactive: ${sendDto.channelKey}`);
    }

    const caller = sendDto.service || 'unknown';
    const purpose = sendDto.purpose || 'system';
    if (channel.applicationsAllowed.length > 0 && !channel.applicationsAllowed.includes(caller)) {
      throw new BadRequestException(`Channel ${sendDto.channelKey} is not allowed for service ${caller}`);
    }
    if (channel.purposesAllowed.length > 0 && !channel.purposesAllowed.includes(purpose)) {
      throw new BadRequestException(`Channel ${sendDto.channelKey} is not allowed for purpose ${purpose}`);
    }

    const resolved: SendNotificationDto = {
      ...sendDto,
      channel: this.mapRegistryTypeToChannel(channel.type),
      emailProvider: this.mapRegistryProviderToEmailProvider(channel.provider) || sendDto.emailProvider,
      fromEmail: sendDto.fromEmail || channel.fromEmail || undefined,
      fromName: sendDto.fromName || channel.fromName || undefined,
      replyToEmail: sendDto.replyToEmail || channel.replyToEmail || undefined,
    };

    this.logger.log(
      `[ChannelRegistryService] resolveSendPolicy() timestamp=${new Date().toISOString()} duration_ms=0 outcome=resolved decisionReason=channel_key_resolved channelKey=${channel.channelKey} service=${caller} purpose=${purpose}`,
      'ChannelRegistryService',
    );

    return {
      dto: resolved,
      decisionReason: 'channel_key_resolved',
    };
  }

  async listChannels(): Promise<ChannelRegistry[]> {
    return this.channelRegistryRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async updateChannel(
    channelKey: string,
    payload: Partial<ChannelRegistry>,
    updatedBy = 'admin-api',
  ): Promise<ChannelRegistry> {
    const existing = await this.channelRegistryRepository.findOne({ where: { channelKey } });
    if (!existing) {
      throw new NotFoundException(`Channel key not found: ${channelKey}`);
    }
    Object.assign(existing, payload, { updatedBy });
    return this.channelRegistryRepository.save(existing);
  }
}
