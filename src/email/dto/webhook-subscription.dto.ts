import { IsString, IsUrl, IsOptional, IsObject, IsNumber, Min, Max } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  serviceName: string;

  @IsUrl()
  webhookUrl: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsObject()
  filters?: {
    to?: string[];
    from?: string[];
    subjectPattern?: string;
  };

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxRetries?: number;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsObject()
  filters?: {
    to?: string[];
    from?: string[];
    subjectPattern?: string;
  };

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxRetries?: number;
}
