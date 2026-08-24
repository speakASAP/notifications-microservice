/**
 * Startup validation for the per-caller service tokens used by JwtRolesGuard.
 *
 * Why this exists: the guard resolves each machine caller with
 * `if (token && this.safeEqual(candidate, token))`. That guard clause is correct for
 * comparison, but it makes an *unset* variable indistinguishable from "no caller matched" —
 * a missing token degrades silently into a 401 instead of announcing a broken deployment.
 *
 * On 2026-08-13 SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN was absent from Vault for ~2 days
 * (the ExternalSecret referencing it failed, so the key never reached the pod). Nothing
 * surfaced it: the pod was healthy, /health was green, and the failure would only have
 * appeared as an unexplained 401 the first time speakasap tried to deliver a notification.
 *
 * Validating at boot converts that silent config gap into an immediate, loud startup failure.
 */

/** Every service-token env var JwtRolesGuard.resolveStaticServiceActor() reads. */
export const REQUIRED_SERVICE_TOKEN_VARS = [
  'SERVICE_TOKEN',
  'CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN',
  'INVOICES_NOTIFICATIONS_SERVICE_TOKEN',
  'SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN',
  'CV_TUNING_NOTIFICATIONS_SERVICE_TOKEN',
] as const;

/**
 * Throws if any required service token is unset, empty, or whitespace-only.
 *
 * Whitespace-only counts as missing because the guard's truthiness check would accept it
 * and then never match a real caller.
 *
 * The error names the offending variables but never their values — this message is logged.
 */
export function assertServiceTokensConfigured(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing = REQUIRED_SERVICE_TOKEN_VARS.filter(
    (name) => (env[name] ?? '').trim() === '',
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required service token env var(s): ${missing.join(', ')}. ` +
        'JwtRolesGuard would silently skip the affected caller(s) and reject them as 401. ' +
        'Check the ExternalSecret sync and the corresponding Vault keys.',
    );
  }
}
