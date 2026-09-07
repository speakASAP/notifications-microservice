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

  it('rejects a static service token with Unauthorized', async () => {
    process.env.SERVICE_TOKEN = 'static-secret';
    const { guard } = createGuard({ roles: [NOTIF_SEND] });
    const ctx = createContext({ headers: { authorization: 'Bearer static-secret' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects static tokens on admin and superadmin routes', async () => {
    process.env.SERVICE_TOKEN = 'static-secret';
    const { guard } = createGuard({ roles: ['global:superadmin'] });
    const ctx = createContext({ headers: { authorization: 'Bearer static-secret' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);

    const adminGuard = createGuard({ roles: ['internal:notifications-microservice:admin'] }).guard;
    await expect(
      adminGuard.canActivate(createContext({ headers: { authorization: 'Bearer static-secret' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts an Auth RS256 principal', async () => {
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

  it('rejects Auth principal lacking required role', async () => {
    jest.spyOn(jwtVerifier, 'verifyAuthToken').mockResolvedValue({
      sub: 'svc-auth',
      roles: [NOTIF_SEND],
    });
    const { guard } = createGuard({ roles: ['internal:notifications-microservice:admin'] });
    const ctx = createContext({ headers: { authorization: 'Bearer eyJ.fake.jwt' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('JwtRolesGuard rejects static service actors', () => {
  const originalEnv = process.env;

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
    jest.spyOn(jwtVerifier, 'verifyAuthToken').mockRejectedValue(new UnauthorizedException('not jwt'));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows public routes without token validation', async () => {
    const { guard, jwtService } = createGuard({ isPublic: true });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('rejects the notifications SERVICE_TOKEN machine actor', async () => {
    process.env.SERVICE_TOKEN = 'notifications-token';
    const request = { headers: { authorization: 'Bearer notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects the Cliplot notifications service token', async () => {
    process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN = 'cliplot-notifications-token';
    const request = { headers: { authorization: 'Bearer cliplot-notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects the Invoices notifications service token', async () => {
    process.env.INVOICES_NOTIFICATIONS_SERVICE_TOKEN = 'invoices-notifications-token';
    const request = { headers: { authorization: 'Bearer invoices-notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects the cv-tuning notifications service token', async () => {
    process.env.CV_TUNING_NOTIFICATIONS_SERVICE_TOKEN = 'cv-tuning-notifications-token';
    const request = { headers: { authorization: 'Bearer cv-tuning-notifications-token' } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a mismatched bearer with Unauthorized', async () => {
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

  it.each(perCaller)('rejects %s for %s', async (envVar, caller) => {
    process.env[envVar] = `${caller}-token`;
    const request = { headers: { authorization: `Bearer ${caller}-token` } };
    const { guard } = createGuard({ roles: [...NOTIFICATIONS_SEND_ROLES] });

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
