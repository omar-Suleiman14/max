import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function assetFolder(name: string): string | undefined {
  if (!/^[0-9a-f]{64}\.[a-z0-9]{1,10}$/.test(name)) return undefined;
  const extension = name.split('.').at(-1)!;
  if (['png', 'jpg', 'gif', 'webp'].includes(extension)) return 'images';
  if (['mp4', 'webm'].includes(extension)) return 'videos';
  if (['mp3', 'wav', 'ogg'].includes(extension)) return 'audio';
  if (extension === 'zip') return 'archives';
  if (['pdf', 'txt', 'csv', 'json', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) return 'documents';
  return undefined;
}

/** URLs remain stable across the folder migration; old workspaces still open. */
export function storedAssetPath(root: string, name: string): string | undefined {
  const folder = assetFolder(name);
  if (!folder) return undefined;
  const target = join(root, folder, name);
  return existsSync(target) ? target : join(root, name);
}
