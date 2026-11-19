/**
 * はてな API エラーコード
 */
export type HatenaApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_URL'
  | 'API_ERROR';

/**
 * HatenaApiError の生成オプション
 */
export interface HatenaApiErrorOptions {
  code: HatenaApiErrorCode;
  status?: number;
  responseBody?: string;
  cause?: unknown;
}

/**
 * はてな API 呼び出しで発生する統一エラークラス
 */
export class HatenaApiError extends Error {
  public readonly code: HatenaApiErrorCode;
  public readonly status?: number;
  public readonly responseBody?: string;

  constructor(message: string, options: HatenaApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'HatenaApiError';
    this.code = options.code;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

/**
 * HTTP ステータスコードからはてな API エラーコードへ変換する
 */
export function statusToErrorCode(status: number): HatenaApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  return 'API_ERROR';
}

/**
 * 例外がタイムアウト / Abort 起因かを判定する
 */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: string; message?: string };
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  if (err.code === 'ETIMEDOUT' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
    return true;
  }
  return (
    typeof err.message === 'string' &&
    /timeout|timed out|abort/i.test(err.message)
  );
}
