import type { HatenaRetryOptions } from '../types.js';

const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;

export interface ResolvedRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * リトライ設定を解決する
 */
export function resolveRetryConfig(
  option?: HatenaRetryOptions | false,
): ResolvedRetryConfig {
  if (!option) {
    return {
      maxRetries: 0,
      baseDelayMs: DEFAULT_BASE_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
    };
  }
  return {
    maxRetries: Math.max(0, option.maxRetries ?? 0),
    baseDelayMs: Math.max(0, option.baseDelayMs ?? DEFAULT_BASE_DELAY_MS),
    maxDelayMs: Math.max(0, option.maxDelayMs ?? DEFAULT_MAX_DELAY_MS),
  };
}

/**
 * HTTP ステータスコードがリトライ対象（429 / 5xx）かを判定する
 */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Retry-After ヘッダー値（秒数または HTTP-date）をミリ秒に変換する
 */
export function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }

  const targetTime = Date.parse(trimmed);
  if (!Number.isNaN(targetTime)) {
    return Math.max(0, targetTime - Date.now());
  }

  return null;
}

/**
 * リトライ待機時間（ミリ秒）を計算する（Retry-After 優先、それ以外は指数バックオフ + ジッター）
 */
export function computeBackoffDelayMs(
  attempt: number,
  config: ResolvedRetryConfig,
  retryAfterHeader?: string | null,
): number {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader ?? null);
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, config.maxDelayMs);
  }

  const exponential = Math.min(
    config.baseDelayMs * 2 ** attempt,
    config.maxDelayMs,
  );
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(exponential * jitterFactor);
}

/**
 * AbortSignal 対応のスリープ
 */
export function sleepWithSignal(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (ms <= 0) {
    if (signal?.aborted) {
      return Promise.reject(signal.reason);
    }
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
