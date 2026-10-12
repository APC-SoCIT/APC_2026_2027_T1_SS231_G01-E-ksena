import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { emergencyTypeLabel } from '@/lib/emergency';
import { recordDispatchAction } from '@/lib/audit';
import {
  INCIDENT_VIDEO_BUCKET,
  STORED_VIDEO_LIMIT,
  type StoredVideo,
  deleteStoredVideo,
  listStoredVideos,
  storedVideoPath,
} from '@/lib/incident-video';
import { PrimaryButton } from '@/components/primary-button';
import {
  Spacing,
  FontSizes,
  BRAND_RED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
  OFF_WHITE,
  BORDER,
  Radius,
  CardShadow,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  SUCCESS,
  SUCCESS_BG,
} from '@/constants/theme';

type ResponderRow = {
  responder_id: string;
  name: string | null;
  responder_phone_number: string | null;
  service_type: string | null;
  station_address: string | null;
  is_active: boolean | null;
};

/** The report a stored video belongs to, when one points at it. */
type LinkedReport = {
  report_id: string | number;
  video_path: string | null;
  bucket_id: string | null;
  classified_as: string | null;
  status: string | null;
  timestamp: string | null;
};

const RLS_HINT =
  ' Run supabase/admin-access.sql in the Supabase SQL Editor, then add this account to the admins table.';

const VIDEO_SQL_HINT = ' Run supabase/admin-account-and-videos.sql in the Supabase SQL Editor.';

function formatWhen(ts: string | null): string {
  if (!ts) return 'No date';
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? ts : new Date(parsed).toLocaleString();
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return 'size unknown';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function AdminScreen() {
  const { isAdmin, loading: authLoading, user, accountEmail } = useAuth();
  const theme = useRoleTheme();

  const [responders, setResponders] = useState<ResponderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [reachedLimit, setReachedLimit] = useState(false);
  const [reportByPath, setReportByPath] = useState<Record<string, LinkedReport>>({});
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoNote, setVideoNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  // A ref as well as the state above: two clicks can land before the first
  // one has re-drawn the button as disabled.
  const deleteBusy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setVideoError(null);

    const people = await supabase
      .from('responders')
      .select('responder_id, name, responder_phone_number, service_type, station_address, is_active')
      .order('name');

    if (people.error) {
      setError(people.error.message + RLS_HINT);
    } else {
      setResponders((people.data ?? []) as ResponderRow[]);
    }

    // The list is read from the bucket, not from the reports that mention a
    // video. The bucket is what is actually stored: it includes files no
    // report points to, and leaves out the ones that are already gone.
    try {
      const stored = await listStoredVideos();
      setVideos(stored.videos);
      setReachedLimit(stored.reachedLimit);
    } catch (err) {
      setVideos([]);
      setReachedLimit(false);
      setVideoError(`Could not list the stored videos: ${errorText(err)}.${VIDEO_SQL_HINT}`);
    }

    // Read only to say which report each file belongs to.
    const linked = await supabase
      .from('reports')
      .select('report_id, video_path, bucket_id, classified_as, status, timestamp')
      .not('video_path', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(1000);

    if (!linked.error) {
      const byPath: Record<string, LinkedReport> = {};
      for (const row of (linked.data ?? []) as LinkedReport[]) {
        const path = storedVideoPath(row);
        if (path && !byPath[path]) byPath[path] = row;
      }
      setReportByPath(byPath);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  const toggleActive = async (row: ResponderRow) => {
    const next = !(row.is_active ?? true);
    setSavingId(row.responder_id);
    setError(null);
    const { error: updateError } = await supabase
      .from('responders')
      .update({ is_active: next })
      .eq('responder_id', row.responder_id);
    setSavingId(null);
    if (updateError) {
      setError(updateError.message + RLS_HINT);
      return;
    }
    setResponders((prev) =>
      prev.map((r) => (r.responder_id === row.responder_id ? { ...r, is_active: next } : r))
    );
  };

  const handleDelete = async (video: StoredVideo) => {
    if (deleteBusy.current) return;
    deleteBusy.current = true;
    setDeletingPath(video.path);
    setVideoNote(null);

    try {
      await deleteStoredVideo(video.path);
    } catch (err) {
      setVideoNote({ ok: false, text: `${video.path} was not deleted. ${errorText(err)}` });
      setConfirmPath(null);
      setDeletingPath(null);
      deleteBusy.current = false;
      return;
    }

    setVideos((prev) => prev.filter((v) => v.path !== video.path));
    setConfirmPath(null);
    setDeletingPath(null);
    deleteBusy.current = false;

    // Written after the file is gone, never before: an entry for a deletion
    // that then failed would be a record of something that did not happen.
    const report = reportByPath[video.path];
    const auditError = await recordDispatchAction(
      {
        action: 'video_delete',
        previousValue: video.path,
        newValue: null,
        reportIds: report ? [String(report.report_id)] : [],
        detail: { bucket: INCIDENT_VIDEO_BUCKET, size_bytes: video.sizeBytes, uploaded_at: video.createdAt },
      },
      { username: user?.username ?? accountEmail, role: 'admin' }
    );
    if (!auditError) {
      setVideoNote({ ok: true, text: `${video.path} was deleted.` });
      return;
    }
    const hint = /check constraint/i.test(auditError) ? VIDEO_SQL_HINT : '';
    setVideoNote({
      ok: false,
      text: `${video.path} was deleted, but the deletion was not recorded in the audit log: ${auditError}.${hint}`,
    });
  };

  if (authLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={BRAND_RED} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, CardShadow, styles.noticeCard]}>
          <Text style={styles.noticeTitle}>Admin access required</Text>
          <Text style={styles.noticeText}>
            This account is not an administrator. Admins are listed in the admins table in Supabase rather than
            set during sign-up, so that no account can grant it to itself.
          </Text>
          <Text style={styles.noticeText}>
            To grant access, run supabase/admin-access.sql in the Supabase SQL Editor, then insert this
            account&apos;s id into the admins table.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const activeCount = responders.filter((r) => r.is_active ?? true).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Admin</Text>
      <Text style={styles.subtitle}>Responder accounts and the incident videos held in storage.</Text>

      {error ? (
        <View style={[styles.card, CardShadow, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton title="Retry" onPress={load} style={styles.retryBtn} />
        </View>
      ) : null}

      {loading ? <ActivityIndicator size="large" color={theme.primary} style={styles.loader} /> : null}

      <Text style={styles.sectionTitle}>
        Responder Accounts ({activeCount} active of {responders.length})
      </Text>
      {!loading && responders.length === 0 ? (
        <Text style={styles.emptyText}>No responder records are visible to this account.</Text>
      ) : null}
      {responders.map((r) => {
        const active = r.is_active ?? true;
        return (
          <View key={r.responder_id} style={[styles.card, CardShadow, styles.rowCard]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{r.name ?? 'Unnamed responder'}</Text>
              <Text style={styles.rowDetail}>
                {(r.service_type ?? 'unassigned').toUpperCase()}
                {r.responder_phone_number ? ` · ${r.responder_phone_number}` : ' · no contact number'}
              </Text>
              {r.station_address ? <Text style={styles.rowDetail}>{r.station_address}</Text> : null}
            </View>
            <View style={styles.rowActions}>
              <View style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}>
                <Text style={[styles.pillText, { color: active ? SUCCESS : BRAND_RED }]}>
                  {active ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <Pressable
                onPress={() => toggleActive(r)}
                disabled={savingId === r.responder_id}
                style={[styles.actionBtn, { borderColor: theme.primary }]}
                accessibilityRole="button"
                accessibilityLabel={`${active ? 'Deactivate' : 'Activate'} ${r.name ?? 'responder'}`}
              >
                <Text style={[styles.actionBtnText, { color: theme.primary }]}>
                  {savingId === r.responder_id ? 'Saving…' : active ? 'Deactivate' : 'Activate'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>
        Incident Videos ({videos.length}
        {reachedLimit ? '+' : ''} in storage)
      </Text>
      <Text style={styles.sectionNote}>
        A stored video can be opened or deleted here. It cannot be uploaded, replaced or renamed: an admin
        account is refused all three.
      </Text>

      {videoNote ? (
        <View style={[styles.card, videoNote.ok ? styles.okCard : styles.errorCard]}>
          <Text style={videoNote.ok ? styles.okText : styles.errorText}>{videoNote.text}</Text>
        </View>
      ) : null}
      {videoError ? (
        <View style={[styles.card, CardShadow, styles.errorCard]}>
          <Text style={styles.errorText}>{videoError}</Text>
        </View>
      ) : null}
      {reachedLimit ? (
        <Text style={styles.emptyText}>
          Showing {STORED_VIDEO_LIMIT} videos. The bucket holds more than this page lists.
        </Text>
      ) : null}
      {!loading && !videoError && videos.length === 0 ? (
        <Text style={styles.emptyText}>
          No videos are visible in the {INCIDENT_VIDEO_BUCKET} bucket. If the bucket is not empty, this account
          is not being allowed to list it.{VIDEO_SQL_HINT}
        </Text>
      ) : null}

      {videos.map((v) => {
        const report = reportByPath[v.path];
        const confirming = confirmPath === v.path;
        const deleting = deletingPath === v.path;
        return (
          <View key={v.path} style={[styles.card, CardShadow]}>
            <View style={styles.rowInner}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>
                  {report ? emergencyTypeLabel(report.classified_as) : 'Not linked to a report'}
                </Text>
                <Text style={styles.rowDetail}>
                  Uploaded {formatWhen(v.createdAt)} · {formatSize(v.sizeBytes)}
                  {report?.status ? ` · ${report.status}` : ''}
                </Text>
                <Text style={styles.rowPath} numberOfLines={1}>
                  {v.path}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable
                  onPress={() => Linking.openURL(v.publicUrl)}
                  style={[styles.actionBtn, { borderColor: theme.primary }]}
                  accessibilityRole="link"
                  accessibilityLabel={`Open video ${v.path}`}
                >
                  <Text style={[styles.actionBtnText, { color: theme.primary }]}>Open video</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setVideoNote(null);
                    setConfirmPath(v.path);
                  }}
                  disabled={confirming || deletingPath !== null}
                  style={[styles.actionBtn, styles.dangerBtn, (confirming || deletingPath !== null) && styles.dimmed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete video ${v.path}`}
                >
                  <Text style={[styles.actionBtnText, styles.dangerBtnText]}>Delete</Text>
                </Pressable>
              </View>
            </View>

            {/* Asked for in the row itself, not in a browser dialog: the
                question stays next to the file it is about. */}
            {confirming ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>
                  Delete this video for good? It is removed from storage and cannot be brought back.
                  {report ? ' The report it belongs to stays, without its video.' : ''}
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => setConfirmPath(null)}
                    disabled={deleting}
                    style={styles.actionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Keep the video"
                  >
                    <Text style={[styles.actionBtnText, styles.cancelBtnText]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(v)}
                    disabled={deleting}
                    style={[styles.actionBtn, styles.dangerBtnFilled, deleting && styles.dimmed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm deleting ${v.path}`}
                  >
                    <Text style={[styles.actionBtnText, styles.dangerBtnFilledText]}>
                      {deleting ? 'Deleting…' : 'Delete video'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OFF_WHITE },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE },
  title: { fontSize: FontSizes.subtitle, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.body, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: Spacing.sm },
  sectionSpacer: { marginTop: Spacing.lg },
  sectionNote: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, marginBottom: Spacing.md, lineHeight: 20 },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  rowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: FontSizes.body, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 2 },
  rowDetail: { fontSize: FontSizes.sm, color: TEXT_SECONDARY },
  rowPath: { fontSize: FontSizes.xs, color: TEXT_SECONDARY, marginTop: 2, fontStyle: 'italic' },
  rowActions: { alignItems: 'flex-end', gap: Spacing.xs },
  pill: { paddingVertical: 2, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm },
  pillActive: { backgroundColor: SUCCESS_BG },
  pillInactive: { backgroundColor: DANGER_BG },
  pillText: { fontSize: FontSizes.xs, fontWeight: '600' },
  actionBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  actionBtnText: { fontSize: FontSizes.sm, fontWeight: '600' },
  dangerBtn: { borderColor: DANGER_BORDER },
  dangerBtnText: { color: DANGER },
  dangerBtnFilled: { borderColor: DANGER, backgroundColor: DANGER },
  dangerBtnFilledText: { color: WHITE },
  cancelBtnText: { color: TEXT_SECONDARY },
  dimmed: { opacity: 0.5 },
  confirmBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: Spacing.sm,
  },
  confirmText: { fontSize: FontSizes.sm, color: TEXT_PRIMARY, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  emptyText: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, paddingVertical: Spacing.md },
  loader: { marginVertical: Spacing.lg },
  errorCard: { backgroundColor: DANGER_BG, borderColor: DANGER_BORDER },
  okCard: { backgroundColor: SUCCESS_BG, borderColor: SUCCESS },
  okText: { fontSize: FontSizes.sm, color: SUCCESS },
  retryBtn: { marginTop: Spacing.md },
  errorText: { fontSize: FontSizes.sm, color: BRAND_RED },
  noticeCard: { marginTop: Spacing.lg },
  noticeTitle: { fontSize: FontSizes.body, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: Spacing.sm },
  noticeText: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, marginBottom: Spacing.sm },
});
