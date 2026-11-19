import { HatenaApiError } from '../errors.js';

/**
 * URL が安全な HTTPS URL であり、許可されたホストに一致するかを検証する（SSRF 対策）
 */
export function validateAllowedHatenaUrl(
  rawUrl: string,
  allowedHosts: readonly string[],
  errorMessage = '許可されていないはてなAPIのURLです',
): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HatenaApiError(errorMessage, {
      code: 'INVALID_URL',
      status: 400,
    });
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    !allowedHosts.includes(parsed.hostname)
  ) {
    throw new HatenaApiError(errorMessage, {
      code: 'INVALID_URL',
      status: 400,
    });
  }

  return parsed.toString();
}
