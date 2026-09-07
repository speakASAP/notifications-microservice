/**
 * JWT Roles Guard
 * Validates Auth-issued RS256 Bearer JWTs and enforces roles from payload.roles.
 * Static per-caller shared secrets remain only as a migration window.
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
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { ROLES_KEY, PUBLIC_KEY } from './roles.decorator';
import { verifyAuthToken } from './jwt-verifier';

type ServiceActor = {
  sub: string;
  email?: string;
  roles: string[];
  serviceName?: string;
};

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
    const handler = `${context.getClass().name}.${context.getHandler().name}`;

    // Auth-issued RS256 first. A real principal must always be identified as that
    // principal rather than matched against a leftover static secret string.
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
      // Fall through to the migration static path when allowed.
    }

    if (this.staticCredentialsAllowed()) {
      const serviceActor = this.resolveStaticServiceActor(token);
      if (serviceActor) {
        const actorRoles = Array.isArray(serviceActor.roles) ? serviceActor.roles : [];
        if (!requiredRoles.some((r) => actorRoles.includes(r))) {
          this.logger.warn(
            `Static service token ${serviceActor.serviceName ?? 'unknown'} refused on ` +
              `${handler}: lacks required role`,
          );
          throw new ForbiddenException('Insufficient permissions');
        }
        // WARN on every acceptance so the migration has an observable exit
        // condition: this line going quiet per caller proves that caller no
        // longer needs a shared secret. Secret sync / exp is not proof.
        this.logger.warn(
          `Static service token used by ${serviceActor.serviceName ?? 'unknown'} on ` +
            `${handler}; migrate to a per-pair Auth JWT`,
        );
        (request as Request & { user: unknown }).user = serviceActor;
        return true;
      }
    }

    throw new UnauthorizedException('Invalid token');
  }

  /**
   * Defaults open so an unconfigured deploy cannot lock out callers that have
   * not been provisioned yet. Set `ALLOW_NOTIFICATIONS_STATIC_TOKENS=false` to
   * close the migration window after every caller has an authenticated RS256
   * call proof.
   */
  private staticCredentialsAllowed(): boolean {
    const raw = (process.env.ALLOW_NOTIFICATIONS_STATIC_TOKENS ?? 'true').trim().toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'no';
  }

  private resolveStaticServiceActor(token: string): ServiceActor | null {
    const serviceName = process.env.SERVICE_NAME || 'notifications-microservice';
    // Delivery-only. Static secrets must not carry admin — that is a human /
    // operator role. The send role is what every current machine caller needs.
    const sendRole = `internal:${serviceName}:send`;

    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken && this.safeEqual(token, serviceToken)) {
      return {
        sub: `service:${serviceName}`,
        email: undefined,
        roles: [sendRole],
        serviceName,
      };
    }

    const cliplotToken = process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN;
    if (cliplotToken && this.safeEqual(token, cliplotToken)) {
      return {
        sub: 'service:cliplot',
        email: undefined,
        roles: [sendRole],
        serviceName: 'cliplot',
      };
    }

    const cvTuningToken = process.env.CV_TUNING_NOTIFICATIONS_SERVICE_TOKEN;
    if (cvTuningToken && this.safeEqual(token, cvTuningToken)) {
      return {
        sub: 'service:cv-tuning',
        email: undefined,
        roles: [sendRole],
        serviceName: 'cv-tuning',
      };
    }

    const invoicesToken = process.env.INVOICES_NOTIFICATIONS_SERVICE_TOKEN;
    if (invoicesToken && this.safeEqual(token, invoicesToken)) {
      return {
        sub: 'service:invoices-microservice',
        email: undefined,
        roles: [sendRole],
        serviceName: 'invoices-microservice',
      };
    }

    const speakasapToken = process.env.SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN;
    if (speakasapToken && this.safeEqual(token, speakasapToken)) {
      return {
        sub: 'service:speakasap-notification-service',
        email: undefined,
        roles: [sendRole],
        serviceName: 'speakasap-notification-service',
      };
    }

    const perCallerTokens: ReadonlyArray<readonly [string, string]> = [
      ['AUTH_NOTIFICATIONS_SERVICE_TOKEN', 'auth-microservice'],
      ['MARKETING_NOTIFICATIONS_SERVICE_TOKEN', 'marketing-microservice'],
      ['MONITORING_NOTIFICATIONS_SERVICE_TOKEN', 'monitoring-microservice'],
      ['LEADS_NOTIFICATIONS_SERVICE_TOKEN', 'leads-microservice'],
      ['DOMAIN_RESEARCH_NOTIFICATIONS_SERVICE_TOKEN', 'domain-research'],
      ['RUNLAYER_NOTIFICATIONS_SERVICE_TOKEN', 'runlayer'],
    ];

    for (const [envVar, callerName] of perCallerTokens) {
      const callerToken = process.env[envVar];
      if (callerToken && this.safeEqual(token, callerToken)) {
        return {
          sub: `service:${callerName}`,
          email: undefined,
          roles: [sendRole],
          serviceName: callerName,
        };
      }
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
