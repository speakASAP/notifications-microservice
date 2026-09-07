/**
 * JWT Roles Guard
 * Validates Auth-issued RS256 Bearer JWTs and enforces roles from payload.roles.
 * Static shared secrets are not accepted — Auth RS256 only, zero fallback.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ROLES_KEY, PUBLIC_KEY } from './roles.decorator';
import { verifyAuthToken } from './jwt-verifier';

@Injectable()
export class JwtRolesGuard implements CanActivate {
  private readonly logger = new Logger(JwtRolesGuard.name);

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
    // Deny by default. The previous fallback returned
    // [global:superadmin, internal:notifications-microservice:admin] for any route
    // without @Roles or @Public, so 29 undecorated routes each accepted the
    // broadest credential in the service. An omission is now a loud 403.
    const requiredRoles = rolesMetadata?.roles?.length ? rolesMetadata.roles : null;
    if (!requiredRoles) {
      const handler = `${context.getClass().name}.${context.getHandler().name}`;
      this.logger.error(
        `Route ${handler} has neither @Roles nor @Public; denying. Add an explicit policy.`,
      );
      throw new ForbiddenException('Route is missing an authorization policy');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    try {
      const payload = await verifyAuthToken(token);
      const userRoles: string[] = Array.isArray(payload.roles) ? payload.roles : [];
      if (!requiredRoles.some((r) => userRoles.includes(r))) {
        throw new ForbiddenException('Insufficient permissions');
      }
      (request as Request & { user: unknown }).user = {
        sub: payload.sub,
        email: payload.email,
        roles: userRoles,
      };
      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(
        err instanceof Error ? err.message : 'Invalid token',
      );
    }
  }
}
