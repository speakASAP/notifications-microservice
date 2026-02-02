/**
 * Config Controller
 * Public config for frontend (auth service URL for login)
 */

import { Controller, Get } from '@nestjs/common';
import { ApiResponseUtil } from '../../shared/utils/api-response.util';

@Controller('api')
export class ConfigController {
  @Get('config')
  getConfig() {
    // Public URL for auth-microservice (browser must call this origin)
    const authServicePublicUrl =
      process.env.AUTH_SERVICE_PUBLIC_URL || process.env.AUTH_SERVICE_URL || '';
    const domain = process.env.DOMAIN || '';
    return ApiResponseUtil.success({
      authServicePublicUrl,
      domain,
      notificationsApiUrl: '', // Same origin when served from this domain
    });
  }
}
