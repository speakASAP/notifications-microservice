/**
 * Config Controller
 * Public config for frontend (auth service URL for login)
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/roles.decorator';
import { ApiResponseUtil } from '../../shared/utils/api-response.util';

@Controller('api')
export class ConfigController {
  @Public()
  @Get('config')
  getConfig() {
    // Public URL for auth-microservice (browser must call this origin)
    const internalAuthServiceUrl = process.env.AUTH_SERVICE_URL || '';
    const authServicePublicUrl =
      process.env.AUTH_SERVICE_PUBLIC_URL ||
      (internalAuthServiceUrl.includes('auth-microservice')
        ? 'https://auth.alfares.cz'
        : internalAuthServiceUrl);
    const domain = process.env.DOMAIN || '';
    return ApiResponseUtil.success({
      authServicePublicUrl,
      domain,
      notificationsApiUrl: '', // Same origin when served from this domain
    });
  }
}
