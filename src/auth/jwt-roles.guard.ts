/**
 * JWT Roles Guard
 * Validates Bearer JWT (same secret as auth-microservice) and enforces roles from payload.roles.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { ROLES_KEY, PUBLIC_KEY } from './roles.decorator';

@Injectable()
export class JwtRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const rolesMetadata = this.reflector.getAllAndOverride<{ roles: string[] }>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = rolesMetadata?.roles?.length ? rolesMetadata.roles : this.getDefaultRoles();

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    const serviceActor = this.resolveStaticServiceActor(token);
    if (serviceActor) {
      (request as Request & { user: unknown }).user = serviceActor;
      return true;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; email?: string; roles?: string[] }>(token, {
        secret: process.env.JWT_SECRET,
      });
      const userRoles: string[] = Array.isArray(payload.roles) ? payload.roles : [];

      const hasRole = requiredRoles.some((r) => userRoles.includes(r));
      if (!hasRole) {
        throw new ForbiddenException('Insufficient permissions');
      }

      (request as Request & { user: unknown }).user = {
        sub: payload.sub,
        email: payload.email,
        roles: userRoles,
      };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException('Invalid token');
    }
  }

  private getDefaultRoles(): string[] {
    const name = process.env.SERVICE_NAME || 'notifications-microservice';
    return [`global:superadmin`, `internal:${name}:admin`];
  }

  private resolveStaticServiceActor(token: string): { sub: string; email?: string; roles: string[]; serviceName?: string } | null {
    const serviceName = process.env.SERVICE_NAME || 'notifications-microservice';
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken && this.safeEqual(token, serviceToken)) {
      return {
        sub: `service:${serviceName}`,
        email: undefined,
        roles: [`global:superadmin`, `internal:${serviceName}:admin`],
        serviceName,
      };
    }

    const cliplotToken = process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN;
    if (cliplotToken && this.safeEqual(token, cliplotToken)) {
      return {
        sub: 'service:cliplot-service',
        email: undefined,
        roles: [`internal:${serviceName}:admin`],
        serviceName: 'cliplot-service',
      };
    }

    return null;
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
