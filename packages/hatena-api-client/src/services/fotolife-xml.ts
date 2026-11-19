import { uint8ArrayToBase64 } from '../auth/wsse.js';
import type {
  HatenaFotolifeFeed,
  HatenaFotolifePhoto,
  UploadFotolifePhotoOptions,
} from '../types.js';
import {
  escapeXml,
  findChild,
  findChildren,
  parseXml,
  type XmlElement,
} from '../xml/simple-xml.js';

function extractPhotoId(editUrl: string | null, syntax: string | null): string {
  if (editUrl) {
    const match = editUrl.match(/\/atom\/edit\/(\d+)/);
    if (match?.[1]) return match[1];
  }
  if (syntax) {
    const match = syntax.match(/f:id:[^:]+:(\d+)/i);
    if (match?.[1]) return match[1];
  }
  return '';
}

function parseFotolifeEntryElement(
  el: XmlElement,
  fallbackUser: string | null,
): HatenaFotolifePhoto {
  const title = findChild(el, 'title')?.text.trim() ?? '';
  const issuedRaw = findChild(el, 'issued')?.text.trim();
  const parsedIssued = issuedRaw ? new Date(issuedRaw) : null;
  const issued =
    parsedIssued && !Number.isNaN(parsedIssued.getTime()) ? parsedIssued : null;

  const imageUrl = findChild(el, 'imageurl')?.text.trim() || null;
  const syntax = findChild(el, 'syntax')?.text.trim() || null;

  let hatenaUser = fallbackUser;
  if (syntax) {
    const userMatch = syntax.match(/f:id:([^:]+):/i);
    if (userMatch?.[1]) {
      hatenaUser = userMatch[1];
    }
  }

  const links = findChildren(el, 'link');
  let editUrl =
    links.find((l) => l.attributes.rel === 'service.edit')?.attributes.href ??
    links.find((l) => l.attributes.rel === 'edit')?.attributes.href ??
    null;

  if (!editUrl && syntax) {
    const idMatch = syntax.match(/f:id:[^:]+:(\d+)/i);
    if (idMatch?.[1]) {
      editUrl = `https://f.hatena.ne.jp/atom/edit/${idMatch[1]}`;
    }
  }

  const photoId = extractPhotoId(editUrl, syntax);

  return {
    photoId,
    title,
    imageUrl,
    syntax,
    editUrl,
    hatenaUser,
    issued,
  };
}

/**
 * はてなフォトライフ画像アップロード用の Atom Entry XML を組み立てる
 */
export function buildFotolifeUploadXml(
  options: UploadFotolifePhotoOptions,
): string {
  const bytes =
    options.file instanceof Uint8Array
      ? options.file
      : new Uint8Array(options.file);
  const base64Content = uint8ArrayToBase64(bytes);
  const contentType = options.contentType?.trim() || 'image/jpeg';
  const folder = options.folder?.trim();

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<entry xmlns="http://purl.org/atom/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `  <title>${escapeXml(options.title)}</title>`,
    `  <content mode="base64" type="${escapeXml(contentType)}">${base64Content}</content>`,
    ...(folder ? [`  <dc:subject>${escapeXml(folder)}</dc:subject>`] : []),
    '</entry>',
  ];

  return lines.join('\n');
}

/**
 * はてなフォトライフの単一エントリ XML（POST レスポンス）をパースする
 */
export function parseFotolifeEntryXml(xml: string): HatenaFotolifePhoto | null {
  const root = parseXml(xml);
  if (!root) return null;
  if (root.localName === 'entry') {
    return parseFotolifeEntryElement(root, null);
  }
  const entry = findChild(root, 'entry');
  return entry ? parseFotolifeEntryElement(entry, null) : null;
}

/**
 * はてなフォトライフの写真一覧フィード XML（GET /atom/feed）をパースする
 */
export function parseFotolifeFeedXml(xml: string): HatenaFotolifeFeed {
  const root = parseXml(xml);
  if (!root) {
    return { hatenaUser: null, photos: [] };
  }

  const authorEl = findChild(root, 'author');
  const hatenaUser =
    (authorEl ? findChild(authorEl, 'name')?.text.trim() : undefined) || null;

  const photos = findChildren(root, 'entry').map((entry) =>
    parseFotolifeEntryElement(entry, hatenaUser),
  );

  return { hatenaUser, photos };
}
