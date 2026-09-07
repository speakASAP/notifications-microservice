import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtRolesGuard } from './jwt-roles.guard';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';
import { NOTIFICATIONS_SEND_ROLES } from './roles.constants';
import * as jwtVerifier from './jwt-verifier';

function createContext(request: any = { headers: {} }): ExecutionContext {
  return {
    getHandler: jest.fn(() => ({ name: 'handler' })),
    getClass: jest.fn(() => ({ name: 'TestController' })),
    switchToHttp: jest.fn(() => ({
      getRequest: () => request,
    })),
  } as any;
}

function createGuard(options: { isPublic?: boolean; roles?: string[] } = {}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === PUBLIC_KEY) return options.isPublic ?? false;
      if (key === ROLES_KEY && options.roles) return { roles: options.roles };
      return undefined;
    }),
  } as unknown as Reflector;
  const jwtService = {
    verify: jest.fn(),
  } as unknown as JwtService;
  return { guard: new JwtRolesGuard(reflector, jwtService), jwtService };
}

describe('JwtRolesGuard route policy', () => {
  const NOTIF_SEND = 'internal:notifications-microservice:send';

  afterEach(() => {
    delete process.env.SERVICE_TOKEN;
    delete process.env.ALLOW_NOTIFICATIONS_STATIC_TOKENS;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(jwtVerifier, 'verifyAuthToken').mockRejectedValue(new UnauthorizedException('not jwt'));
  });

  it('denies a route declaring neither @Roles nor @Public', async () => {
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation(() => undefined);
    const { guard } = createGuard();
    const ctx = createContext({ headers: { authorization: 'Bearer anything' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a static service token on a route whose role it lacks', async () => {
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);
    process.env.SERVICE_TOKEN = 'static-secret';
    const { guard } = createGuard({ roles: ['internal:notifications-microservice:send-only-role'] });
    const ctx = createContext({ headers: { authorization: 'Bearer static-secret' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a static service token on a send route', async () => {
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);
    process.env.SERVICE_TOKEN = 'static-secret';
    const { guard } = createGuard({ roles: [NOTIF_SEND] });
    const ctx = createContext({ headers: { authorization: 'Bearer static-secret' } });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('no longer grants admin or global:superadmin to the shared SERVICE_TOKEN', async () => {
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);
    process.env.SERVICE_TOKEN = 'static-secret';
    const { guard } = createGuard({ roles: ['global:superadmin'] });
    const ctx = createContext({ headers: { authorization: 'Bearer static-secret' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);

    const adminGuard = createGuard({ roles: ['internal:notifications-microservice:admin'] }).guard;
    await expect(
      adminGuard.canActivate(createContext({ headers: { authorization: 'Bearer static-secret' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects static tokens when ALLOW_NOTIFICATIONS_STATIC_TOKENS=false', async () => {
    process.env.SERVICE_TOKEN = 'static-secret';
    process.env.ALLOW_NOTIFICATIONS_STATIC_TOKENS = 'false';
    const { guard } = createGuard({ roles: [NOTIF_SEND] });
    const ctx = createContext({ headers: { authorization: 'Bearer static-secret' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts an Auth RS256 principal before considering static secrets', async () => {
    jest.spyOn(jwtVerifier, 'verifyAuthToken').mockResolvedValue({
      sub: 'svc-auth',
      email: 'svc-auth-microservice--notifications-microservice@internal.alfares.cz',
      roles: [NOTIF_SEND],
    });
    process.env.SERVICE_TOKEN = 'static-secret';
    const request = { headers: { authorization: 'Bearer eyJ.fake.jwt' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        sub: 'svc-auth',
        email: 'svc-auth-microservice--notifications-microservice@internal.alfares.cz',
        roles: [NOTIF_SEND],
      },
    });
  });
});

describe('JwtRolesGuard static service actors', () => {
  const originalEnv = process.env;
  const SEND = 'internal:notifications-microservice:send';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SERVICE_NAME = 'notifications-microservice';
    delete process.env.SERVICE_TOKEN;
    delete process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.INVOICES_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.AUTH_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.MARKETING_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.MONITORING_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.LEADS_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.DOMAIN_RESEARCH_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.RUNLAYER_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.CV_TUNING_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.ALLOW_NOTIFICATIONS_STATIC_TOKENS;
    jest.spyOn(jwtVerifier, 'verifyAuthToken').mockRejectedValue(new UnauthorizedException('not jwt'));
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows public routes without token validation', async () => {
    const { guard, jwtService } = createGuard({ isPublic: true });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('accepts the existing notifications SERVICE_TOKEN machine actor as send', async () => {
    process.env.SERVICE_TOKEN = 'notifications-token';
    const request = { headers: { authorization: 'Bearer notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      user: {
        sub: 'service:notifications-microservice',
        roles: [SEND],
        serviceName: 'notifications-microservice',
      },
    });
  });

  it('accepts the Cliplot notifications service token as a machine actor', async () => {
    process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN = 'cliplot-notifications-token';
    const request = { headers: { authorization: 'Bearer cliplot-notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      user: {
        sub: 'service:cliplot',
        roles: [SEND],
        serviceName: 'cliplot',
      },
    });
  });

  it('accepts the Invoices notifications service token as a machine actor', async () => {
    process.env.INVOICES_NOTIFICATIONS_SERVICE_TOKEN = 'invoices-notifications-token';
    const request = { headers: { authorization: 'Bearer invoices-notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      user: {
        sub: 'service:invoices-microservice',
        roles: [SEND],
        serviceName: 'invoices-microservice',
      },
    });
  });

  it('accepts the cv-tuning notifications service token as a machine actor', async () => {
    process.env.CV_TUNING_NOTIFICATIONS_SERVICE_TOKEN = 'cv-tuning-notifications-token';
    const request = { headers: { authorization: 'Bearer cv-tuning-notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        sub: 'service:cv-tuning',
        roles: [SEND],
        serviceName: 'cv-tuning',
      },
    });
  });

  it('falls through mismatched static tokens to JWT validation and fails closed', async () => {
    process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN = 'cliplot-notifications-token';
    const request = { headers: { authorization: 'Bearer wrong-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(UnauthorizedException);
  });

  const perCaller: Array<[string, string]> = [
    ['AUTH_NOTIFICATIONS_SERVICE_TOKEN', 'auth-microservice'],
    ['MARKETING_NOTIFICATIONS_SERVICE_TOKEN', 'marketing-microservice'],
    ['MONITORING_NOTIFICATIONS_SERVICE_TOKEN', 'monitoring-microservice'],
    ['LEADS_NOTIFICATIONS_SERVICE_TOKEN', 'leads-microservice'],
    ['DOMAIN_RESEARCH_NOTIFICATIONS_SERVICE_TOKEN', 'domain-research'],
    ['RUNLAYER_NOTIFICATIONS_SERVICE_TOKEN', 'runlayer'],
  ];

  it.each(perCaller)('accepts %s and scopes it to %s as send without superadmin', async (envVar, caller) => {
    process.env[envVar] = `${caller}-token`;
    const request = { headers: { authorization: `Bearer ${caller}-token` } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      user: {
        sub: `service:${caller}`,
        roles: [SEND],
        serviceName: caller,
      },
    });
    expect((request as any).user.roles).not.toContain('global:superadmin');
    expect((request as any).user.roles).not.toContain('internal:notifications-microservice:admin');
  });

  it('does not accept one caller\'s token in place of another', async () => {
    process.env.AUTH_NOTIFICATIONS_SERVICE_TOKEN = 'auth-only-token';
    process.env.LEADS_NOTIFICATIONS_SERVICE_TOKEN = 'leads-only-token';
    const request = { headers: { authorization: 'Bearer auth-only-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await guard.canActivate(createContext(request));

    expect((request as any).user.serviceName).toBe('auth-microservice');
  });
});
