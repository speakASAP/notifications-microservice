/**
 * JWT Roles Guard
 * Validates Bearer JWT (same secret as auth-microservice) and enforces roles from payload.roles.
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

    // A static service token is still subject to the route's policy. It used to
    // return true here outright, so any holder of SERVICE_TOKEN reached every
    // route in the service regardless of what the route required.
    const serviceActor = this.resolveStaticServiceActor(token);
    if (serviceActor) {
      const actorRoles = Array.isArray(serviceActor.roles) ? serviceActor.roles : [];
      if (!requiredRoles.some((r) => actorRoles.includes(r))) {
        this.logger.warn(
          `Static service token ${serviceActor.serviceName ?? 'unknown'} refused on ` +
            `${context.getClass().name}.${context.getHandler().name}: lacks required role`,
        );
        throw new ForbiddenException('Insufficient permissions');
      }
      this.logger.warn(
        `Static service token used by ${serviceActor.serviceName ?? 'unknown'} on ` +
          `${context.getClass().name}.${context.getHandler().name}; migrate to a per-pair Auth JWT`,
      );
      (request as Request & { user: unknown }).user = serviceActor;
      return true;
    }

    try {
      // TASK-KEY-F3: accepts RS256 (auth's published key) and HS256 (the shared secret)
      // while the migration runs. See jwt-verifier.ts for the sequencing.
      const payload = await verifyAuthToken(token);
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


  private resolveStaticServiceActor(token: string): { sub: string; email?: string; roles: string[]; serviceName?: string } | null {
    const serviceName = process.env.SERVICE_NAME || 'notifications-microservice';
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken && this.safeEqual(token, serviceToken)) {
      return {
        sub: `service:${serviceName}`,
        email: undefined,
        // Was [global:superadmin, internal:<self>:admin]. A shared static string
        // must not carry the ecosystem's broadest role; admin on this service is
        // already more than any current caller needs.
        roles: [`internal:${serviceName}:admin`],
        serviceName,
      };
    }

    const cliplotToken = process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN;
    if (cliplotToken && this.safeEqual(token, cliplotToken)) {
      return {
        sub: 'service:cliplot',
        email: undefined,
        roles: [`internal:${serviceName}:admin`],
        serviceName: 'cliplot',
      };
    }

    // cv-tuning sends one thing: the outcome nudge that asks a user whether they heard back
    // about an application they downloaded. Scoped like the other per-consumer tokens rather
    // than sharing SERVICE_TOKEN, which grants admin on this service — a nudge needs no such reach.
    const cvTuningToken = process.env.CV_TUNING_NOTIFICATIONS_SERVICE_TOKEN;
    if (cvTuningToken && this.safeEqual(token, cvTuningToken)) {
      return {
        sub: 'service:cv-tuning',
        email: undefined,
        roles: [`internal:${serviceName}:admin`],
        serviceName: 'cv-tuning',
      };
    }

    const invoicesToken = process.env.INVOICES_NOTIFICATIONS_SERVICE_TOKEN;
    if (invoicesToken && this.safeEqual(token, invoicesToken)) {
      return {
        sub: 'service:invoices-microservice',
        email: undefined,
        roles: [`internal:${serviceName}:admin`],
        serviceName: 'invoices-microservice',
      };
    }

    // speakasap-notification-service is the transport's only caller: it renders and
    // addresses the mail, then hands it here purely for delivery. Scoped like the
    // other per-consumer tokens rather than sharing SERVICE_TOKEN, which grants
    // admin on this service — delivery needs no such reach.
    const speakasapToken = process.env.SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN;
    if (speakasapToken && this.safeEqual(token, speakasapToken)) {
      return {
        sub: 'service:speakasap-notification-service',
        email: undefined,
        roles: [`internal:${serviceName}:admin`],
        serviceName: 'speakasap-notification-service',
      };
    }

    // Per-caller tokens for the services that previously authenticated with the shared
    // SERVICE_TOKEN. That token grants admin on this service; none of these callers needs more
    // than delivery rights, so each gets its own credential scoped to internal:<svc>:admin.
    // A leak of any one of them no longer exposes the other callers or superadmin.
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
          roles: [`internal:${serviceName}:admin`],
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
