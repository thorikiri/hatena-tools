/**
 * Uint8Array を Base64 文字列に変換する（Web 標準 API のみ使用）
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * WSSE ヘッダー生成オプション（主にテスト決定性確保用）
 */
export interface BuildWsseHeaderOptions {
  nonce?: Uint8Array;
  created?: string;
}

/**
 * はてな WSSE 認証用の X-WSSE ヘッダー値を生成する
 * 形式: UsernameToken Username="...", PasswordDigest="...", Nonce="...", Created="..."
 */
export async function buildWsseHeader(
  hatenaId: string,
  apiKey: string,
  options?: BuildWsseHeaderOptions,
): Promise<string> {
  const nonceBytes =
    options?.nonce ?? crypto.getRandomValues(new Uint8Array(16));
  const created = options?.created ?? new Date().toISOString();

  const encoder = new TextEncoder();
  const suffixBytes = encoder.encode(`${created}${apiKey}`);
  const digestInput = new Uint8Array(nonceBytes.length + suffixBytes.length);
  digestInput.set(nonceBytes, 0);
  digestInput.set(suffixBytes, nonceBytes.length);

  const hashBuffer = await crypto.subtle.digest('SHA-1', digestInput);
  const passwordDigest = uint8ArrayToBase64(new Uint8Array(hashBuffer));
  const nonceBase64 = uint8ArrayToBase64(nonceBytes);

  return `UsernameToken Username="${hatenaId}", PasswordDigest="${passwordDigest}", Nonce="${nonceBase64}", Created="${created}"`;
}
