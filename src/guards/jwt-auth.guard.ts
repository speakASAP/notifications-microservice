/**
 * JWT Auth Guard
 * Validates JWT token via auth-microservice (production-ready, no modifications there)
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.substring(7);
    const authServiceUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!authServiceUrl) {
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
    } catch {
      // Invalid or expired token
    }
    throw new UnauthorizedException('Invalid or expired token');
  }
}
