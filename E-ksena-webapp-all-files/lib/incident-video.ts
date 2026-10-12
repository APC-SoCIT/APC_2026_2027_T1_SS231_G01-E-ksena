import { supabase } from '@/lib/supabase';

export type VideoSource = { video_path: string | null; bucket_id: string | null };

/** The bucket the phone app uploads every incident video to. */
export const INCIDENT_VIDEO_BUCKET = 'incident-videos';

/** Placeholder paths the mobile app writes when no real file was uploaded. */
export function isPlaceholderVideo(path: string | null): boolean {
  if (!path) return true;
  return path.startsWith('mock://') || path.startsWith('live://');
}

/** The playable URL of a report's recorded video, or null when it has none. */
export function publicVideoUrl(row: VideoSource): string | null {
  if (!row.video_path || isPlaceholderVideo(row.video_path)) return null;
  if (row.video_path.startsWith('http')) return row.video_path;
  const { data } = supabase.storage.from(row.bucket_id ?? INCIDENT_VIDEO_BUCKET).getPublicUrl(row.video_path);
  return data?.publicUrl ?? null;
}

/** One file as it sits in the bucket. */
export type StoredVideo = {
  /** Where it is inside the bucket: what the storage API takes to open or delete it. */
  path: string;
  createdAt: string | null;
  sizeBytes: number | null;
  publicUrl: string;
};

const PUBLIC_URL_MARKER = `/storage/v1/object/public/${INCIDENT_VIDEO_BUCKET}/`;

/**
 * Where a report's video sits in the bucket, or null when it is not a file
 * there. Reports from the phone app hold the whole public address, so the
 * path is cut back out of it; this is what ties a stored file to its report.
 */
export function storedVideoPath(row: VideoSource): string | null {
  const value = row.video_path;
  if (!value || isPlaceholderVideo(value)) return null;
  if (!value.startsWith('http')) {
    return (row.bucket_id ?? INCIDENT_VIDEO_BUCKET) === INCIDENT_VIDEO_BUCKET ? value : null;
  }
  const at = value.indexOf(PUBLIC_URL_MARKER);
  if (at === -1) return null;
  const encoded = value.slice(at + PUBLIC_URL_MARKER.length).split(/[?#]/)[0];
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

const LIST_PAGE_SIZE = 100;

/** The most files one listing will gather, so a very full bucket cannot stall the page. */
export const STORED_VIDEO_LIMIT = 1000;

/**
 * Every video in the bucket, newest first.
 *
 * The phone app has stored videos both at the top level and inside a folder
 * per reporter, so folders are opened as well as read past. `reachedLimit`
 * says the listing stopped at the ceiling and there may be more.
 */
export async function listStoredVideos(): Promise<{ videos: StoredVideo[]; reachedLimit: boolean }> {
  const bucket = supabase.storage.from(INCIDENT_VIDEO_BUCKET);
  const videos: StoredVideo[] = [];
  const folders: string[] = [''];
  let reachedLimit = false;

  while (folders.length > 0 && !reachedLimit) {
    const folder = folders.shift() as string;
    for (let offset = 0; !reachedLimit; offset += LIST_PAGE_SIZE) {
      const { data, error } = await bucket.list(folder, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) throw error;
      const entries = data ?? [];

      for (const entry of entries) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        // A folder comes back as an entry with no id of its own.
        if (!entry.id) {
          folders.push(path);
          continue;
        }
        if (entry.name === '.emptyFolderPlaceholder') continue;
        const size = (entry.metadata as { size?: unknown } | null)?.size;
        videos.push({
          path,
          createdAt: entry.created_at ?? null,
          sizeBytes: typeof size === 'number' ? size : null,
          publicUrl: bucket.getPublicUrl(path).data.publicUrl,
        });
        if (videos.length >= STORED_VIDEO_LIMIT) {
          reachedLimit = true;
          break;
        }
      }

      if (entries.length < LIST_PAGE_SIZE) break;
    }
  }

  videos.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return { videos, reachedLimit };
}

/**
 * Deletes one file from the bucket for good.
 *
 * The storage API answers a delete it was not allowed to carry out the same
 * way it answers one for a file that is not there: an empty list, no error.
 * So the list is checked. Reporting success for a video that is still in the
 * bucket is the one outcome this must never produce.
 */
export async function deleteStoredVideo(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(INCIDENT_VIDEO_BUCKET).remove([path]);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      'Nothing was deleted. Either the file is already gone, or this account is not allowed to delete it - run supabase/admin-account-and-videos.sql in the Supabase SQL Editor.'
    );
  }
}
