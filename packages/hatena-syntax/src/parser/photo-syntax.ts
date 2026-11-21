import type { HatenaPhotoInfo } from '../ast/types.js';

const HATENA_EXT_MAP: Record<string, string> = {
  j: 'jpg',
  p: 'png',
  g: 'gif',
  b: 'bmp',
};

const PHOTO_SYNTAX_REGEX =
  /\[?f:id:([a-zA-Z0-9_-]+):(\d{8})(\d{6})([a-zA-Z0-9])((?::[\w\d-]+)*)\]?/;

/**
 * はてなフォトライフ記法（例: `[f:id:user:20261121120000j:image]`）をパースして画像URLやメタ情報を抽出する
 */
export function parseHatenaPhotoSyntax(
  syntaxOrText?: string | null,
): HatenaPhotoInfo | null {
  if (!syntaxOrText) return null;
  const match = PHOTO_SYNTAX_REGEX.exec(syntaxOrText.trim());
  if (!match) return null;

  const [, user, date, time, extCode, optionsStr = ''] = match;
  if (!user || !date || !time || !extCode) return null;

  const ext = HATENA_EXT_MAP[extCode.toLowerCase()] ?? 'jpg';
  const initial = user.charAt(0).toLowerCase();
  const photoId = `${date}${time}`;
  const imageUrl = `https://cdn-ak.f.st-hatena.com/images/fotolife/${initial}/${user}/${date}/${photoId}.${ext}`;
  const syntax = `f:id:${user}:${photoId}${extCode}${optionsStr}`;

  return {
    user,
    date,
    time,
    extCode,
    ext,
    photoId,
    options: optionsStr,
    imageUrl,
    syntax,
  };
}
