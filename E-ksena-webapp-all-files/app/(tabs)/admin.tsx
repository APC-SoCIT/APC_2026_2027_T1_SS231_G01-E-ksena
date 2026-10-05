import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { emergencyTypeLabel } from '@/lib/emergency';
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

type VideoRow = {
  report_id: string;
  video_path: string | null;
  bucket_id: string | null;
  classified_as: string | null;
  status: string | null;
  timestamp: string | null;
};

const RLS_HINT =
  ' Run supabase/admin-access.sql in the Supabase SQL Editor, then add this account to the admins table.';

/** Placeholder paths the mobile app writes when no real file was uploaded. */
function isPlaceholderVideo(path: string | null): boolean {
  if (!path) return true;
  return path.startsWith('mock://') || path.startsWith('live://');
}

function publicVideoUrl(row: VideoRow): string | null {
  if (!row.video_path || isPlaceholderVideo(row.video_path)) return null;
  if (row.video_path.startsWith('http')) return row.video_path;
  const { data } = supabase.storage.from(row.bucket_id ?? 'incident-videos').getPublicUrl(row.video_path);
  return data?.publicUrl ?? null;
}

function formatWhen(ts: string | null): string {
  if (!ts) return 'No date';
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? ts : new Date(parsed).toLocaleString();
}

export default function AdminScreen() {
  const { isAdmin, loading: authLoading } = useAuth();
  const theme = useRoleTheme();

  const [responders, setResponders] = useState<ResponderRow[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const people = await supabase
      .from('responders')
      .select('responder_id, name, responder_phone_number, service_type, station_address, is_active')
      .order('name');

    if (people.error) {
      setError(people.error.message + RLS_HINT);
    } else {
      setResponders((people.data ?? []) as ResponderRow[]);
    }

    const clips = await supabase
      .from('reports')
      .select('report_id, video_path, bucket_id, classified_as, status, timestamp')
      .not('video_path', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (!clips.error) setVideos((clips.data ?? []) as VideoRow[]);
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
  const realVideos = videos.filter((v) => !isPlaceholderVideo(v.video_path));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Admin</Text>
      <Text style={styles.subtitle}>Responder accounts and the incident videos held in the database.</Text>

      {error ? (
        <View style={[styles.card, CardShadow, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
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
        Incident Videos ({realVideos.length} playable of {videos.length})
      </Text>
      {!loading && videos.length === 0 ? (
        <Text style={styles.emptyText}>No reports carry a video path yet.</Text>
      ) : null}
      {videos.map((v) => {
        const url = publicVideoUrl(v);
        return (
          <View key={v.report_id} style={[styles.card, CardShadow, styles.rowCard]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{emergencyTypeLabel(v.classified_as)}</Text>
              <Text style={styles.rowDetail}>
                {formatWhen(v.timestamp)}
                {v.status ? ` · ${v.status}` : ''}
              </Text>
              <Text style={styles.rowPath} numberOfLines={1}>
                {v.video_path}
              </Text>
            </View>
            <View style={styles.rowActions}>
              {url ? (
                <Pressable
                  onPress={() => Linking.openURL(url)}
                  style={[styles.actionBtn, { borderColor: theme.primary }]}
                  accessibilityRole="link"
                  accessibilityLabel="Open video"
                >
                  <Text style={[styles.actionBtnText, { color: theme.primary }]}>Open video</Text>
                </Pressable>
              ) : (
                <Text style={styles.placeholderText}>Placeholder, no file</Text>
              )}
            </View>
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
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
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
    backgroundColor: WHITE,
  },
  actionBtnText: { fontSize: FontSizes.sm, fontWeight: '600' },
  placeholderText: { fontSize: FontSizes.xs, color: TEXT_SECONDARY, fontStyle: 'italic' },
  emptyText: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, paddingVertical: Spacing.md },
  loader: { marginVertical: Spacing.lg },
  errorCard: { backgroundColor: DANGER_BG, borderColor: DANGER_BORDER },
  errorText: { fontSize: FontSizes.sm, color: BRAND_RED },
  noticeCard: { marginTop: Spacing.lg },
  noticeTitle: { fontSize: FontSizes.body, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: Spacing.sm },
  noticeText: { fontSize: FontSizes.sm, color: TEXT_SECONDARY, marginBottom: Spacing.sm },
});
