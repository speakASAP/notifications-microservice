/**
 * JWT Auth Guard
 * Validates JWT token via auth-microservice (production-ready, no modifications there)
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('JWT validation failed: no Bearer token in request');
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.substring(7);
    const authServiceUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!authServiceUrl) {
      this.logger.warn('JWT validation failed: AUTH_SERVICE_URL not configured');
      throw new UnauthorizedException('Auth service not configured');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${authServiceUrl.replace(/\/$/, '')}/auth/validate`,
          { token },
          { timeout: 10000 },
        ),
      );
      const data = response.data as { valid?: boolean; user?: unknown };
      if (data?.valid && data?.user) {
        request.user = data.user;
        return true;
      }
      this.logger.warn('JWT validation failed: auth service returned valid=false or no user');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      this.logger.warn(
        `JWT validation failed (auth-microservice call): ${msg}${code ? ` code=${code}` : ''}`,
      );
      // Invalid or expired token, or timeout/network error
    }
    throw new UnauthorizedException('Invalid or expired token');
  }
}
