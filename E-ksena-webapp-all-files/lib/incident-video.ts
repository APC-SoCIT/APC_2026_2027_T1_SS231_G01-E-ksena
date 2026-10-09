import { supabase } from '@/lib/supabase';

export type VideoSource = { video_path: string | null; bucket_id: string | null };

/** Placeholder paths the mobile app writes when no real file was uploaded. */
export function isPlaceholderVideo(path: string | null): boolean {
  if (!path) return true;
  return path.startsWith('mock://') || path.startsWith('live://');
}

/** The playable URL of a report's recorded video, or null when it has none. */
export function publicVideoUrl(row: VideoSource): string | null {
  if (!row.video_path || isPlaceholderVideo(row.video_path)) return null;
  if (row.video_path.startsWith('http')) return row.video_path;
  const { data } = supabase.storage.from(row.bucket_id ?? 'incident-videos').getPublicUrl(row.video_path);
  return data?.publicUrl ?? null;
}
