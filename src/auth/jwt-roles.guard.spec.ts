import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtRolesGuard } from './jwt-roles.guard';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';

function createContext(request: any = { headers: {} }): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
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

describe('JwtRolesGuard static service actors', () => {
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
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows public routes without token validation', async () => {
    const { guard, jwtService } = createGuard({ isPublic: true });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('accepts the existing notifications SERVICE_TOKEN machine actor', async () => {
    process.env.SERVICE_TOKEN = 'notifications-token';
    const request = { headers: { authorization: 'Bearer notifications-token' } };
    const { guard, jwtService } = createGuard();

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      user: {
        sub: 'service:notifications-microservice',
        roles: ['global:superadmin', 'internal:notifications-microservice:admin'],
        serviceName: 'notifications-microservice',
      },
    });
  });

  it('accepts the Cliplot notifications service token as a machine actor', async () => {
    process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN = 'cliplot-notifications-token';
    const request = { headers: { authorization: 'Bearer cliplot-notifications-token' } };
    const { guard, jwtService } = createGuard();

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      user: {
        sub: 'service:cliplot',
        roles: ['internal:notifications-microservice:admin'],
        serviceName: 'cliplot',
      },
    });
  });

  it('accepts the Invoices notifications service token as a machine actor', async () => {
    process.env.INVOICES_NOTIFICATIONS_SERVICE_TOKEN = 'invoices-notifications-token';
    const request = { headers: { authorization: 'Bearer invoices-notifications-token' } };
    const { guard, jwtService } = createGuard();

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      user: {
        sub: 'service:invoices-microservice',
        roles: ['internal:notifications-microservice:admin'],
        serviceName: 'invoices-microservice',
      },
    });
  });

  it('falls through mismatched static tokens to JWT validation and fails closed', async () => {
    // Asserts the behaviour (an unrecognised token is rejected), not the mechanism.
    // Verification moved to verifyAuthToken in TASK-KEY-F3 so it can accept RS256 as
    // well as HS256; pinning the old jwtService.verify call shape here would break on
    // that refactor without saying anything about security.
    process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN = 'cliplot-notifications-token';
    process.env.JWT_SECRET = 'test-secret';
    const request = { headers: { authorization: 'Bearer wrong-token' } };
    const { guard } = createGuard();

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(UnauthorizedException);
  });

  // TASK-KEY-F2: these callers previously used the shared SERVICE_TOKEN, which grants
  // global:superadmin. Each now has its own credential scoped to delivery rights only.
  const perCaller: Array<[string, string]> = [
    ['AUTH_NOTIFICATIONS_SERVICE_TOKEN', 'auth-microservice'],
    ['MARKETING_NOTIFICATIONS_SERVICE_TOKEN', 'marketing-microservice'],
    ['MONITORING_NOTIFICATIONS_SERVICE_TOKEN', 'monitoring-microservice'],
    ['LEADS_NOTIFICATIONS_SERVICE_TOKEN', 'leads-microservice'],
    ['DOMAIN_RESEARCH_NOTIFICATIONS_SERVICE_TOKEN', 'domain-research'],
    ['RUNLAYER_NOTIFICATIONS_SERVICE_TOKEN', 'runlayer'],
  ];

  it.each(perCaller)('accepts %s and scopes it to %s without superadmin', async (envVar, caller) => {
    process.env[envVar] = `${caller}-token`;
    const request = { headers: { authorization: `Bearer ${caller}-token` } };
    const { guard, jwtService } = createGuard();

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      user: {
        sub: `service:${caller}`,
        roles: [`internal:notifications-microservice:admin`],
        serviceName: caller,
      },
    });
    // the whole point of the split: no caller may hold global rights
    expect((request as any).user.roles).not.toContain('global:superadmin');
  });

  it('does not accept one caller\'s token in place of another', async () => {
    process.env.AUTH_NOTIFICATIONS_SERVICE_TOKEN = 'auth-only-token';
    process.env.LEADS_NOTIFICATIONS_SERVICE_TOKEN = 'leads-only-token';
    const request = { headers: { authorization: 'Bearer auth-only-token' } };
    const { guard } = createGuard();

    await guard.canActivate(createContext(request));

    // auth's token must resolve to auth, never to leads
    expect((request as any).user.serviceName).toBe('auth-microservice');
  });
});
