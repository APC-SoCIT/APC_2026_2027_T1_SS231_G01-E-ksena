import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Pressable, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useJsApiLoader } from '@react-google-maps/api';
import { supabase } from '@/lib/supabase';
import { GOOGLE_MAPS_API_KEY } from '@/lib/env';
import { PrimaryButton } from '@/components/primary-button';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { publicVideoUrl } from '@/lib/incident-video';
import { formatManilaTime } from '@/lib/reporter-display';
import { useOnReconnect } from '@/lib/use-online';
import { Spacing, FontSizes, TEXT_PRIMARY, TEXT_SECONDARY, WHITE, OFF_WHITE, BORDER, Radius, CardShadow, DANGER, DANGER_BG, DANGER_BORDER, SUCCESS, SUCCESS_BG } from '@/constants/theme';
import {
  getEmergencyTypesForRole,
  emergencyTypeLabel,
  EMERGENCY_STATUS_LABELS,
  type EmergencyStatus,
} from '@/lib/emergency';

interface Report {
  id: string;
  title: string;
  content: string;
  details: string;
  classified_as?: string;
  status?: EmergencyStatus;
  created_at?: string;
  lat: number | null;
  lng: number | null;
  videoUrl: string | null;
}

function normalizeReport(row: {
  id?: string;
  report_id?: string;
  title?: string;
  content?: string;
  created_at?: string;
  timestamp?: string;
  classified_as?: string;
  status?: string;
  report_location_lat?: number | string | null;
  report_location_lng?: number | string | null;
  video_path?: string | null;
  bucket_id?: string | null;
}): Report {
  const id = row.report_id ?? row.id ?? '';
  const content = row.content ?? '';
  const firstLine = content.split('\n')[0]?.trim() || '';
  const rest = content.split('\n').slice(1).join('\n').trim();
  const title = row.title ?? (firstLine || 'Report');
  const details = rest;
  const created_at = row.timestamp ?? row.created_at;
  const lat = row.report_location_lat == null ? null : Number(row.report_location_lat);
  const lng = row.report_location_lng == null ? null : Number(row.report_location_lng);
  return {
    id,
    title,
    content,
    details,
    classified_as: row.classified_as,
    status: (row.status as EmergencyStatus) ?? undefined,
    created_at,
    lat,
    lng,
    videoUrl: publicVideoUrl({ video_path: row.video_path ?? null, bucket_id: row.bucket_id ?? null }),
  };
}

/** A report logged by hand has no position, and is stored at 0, 0. */
function hasLocation(report: Report): report is Report & { lat: number; lng: number } {
  return (
    report.lat != null &&
    report.lng != null &&
    !Number.isNaN(report.lat) &&
    !Number.isNaN(report.lng) &&
    !(report.lat === 0 && report.lng === 0)
  );
}

type OpenReport = { id: string; mode: 'view' | 'edit' };

export default function ReportsScreen() {
  const theme = useRoleTheme();
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  // The one report shown in the panel above the list, and whether it is being
  // read or changed. Nothing is open until View or Edit is pressed: a report
  // cannot be written here, only looked at and added to.
  const [open, setOpen] = useState<OpenReport | null>(null);
  const [detailsDraft, setDetailsDraft] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The same loader the Map uses, with the same options, so the two screens
  // share one copy of Google Maps instead of asking for it twice.
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [addressCache, setAddressCache] = useState<Record<string, string>>({});
  const listRef = useRef<FlatList<Report> | null>(null);

  const allowedTypes = getEmergencyTypesForRole(user?.role);

  const fetchReports = useCallback(async () => {
    setLoadError(null);
    if (allowedTypes.length === 0) {
      setReports([]);
      return;
    }
    const cols = 'report_id, classified_as, status, report_location_lat, report_location_lng, timestamp, video_path, bucket_id, is_processed';
    let data: unknown[] | null = null;
    let error: { message: string } | null = null;

    const first = await supabase
      .from('reports')
      .select(`${cols}, content`)
      .in('classified_as', allowedTypes)
      .order('timestamp', { ascending: false });
    data = first.data;
    error = first.error;

    if (error && /column.*content.*does not exist/i.test(error.message)) {
      const fallback = await supabase.from('reports').select(cols).in('classified_as', allowedTypes).order('timestamp', { ascending: false });
      data = fallback.data ?? [];
      error = fallback.error ?? null;
    }
    if (error && /column.*status.*does not exist/i.test(error.message)) {
      const colsNoStatus = 'report_id, classified_as, report_location_lat, report_location_lng, timestamp, video_path, bucket_id, is_processed, content';
      const fallback = await supabase.from('reports').select(colsNoStatus).in('classified_as', allowedTypes).order('timestamp', { ascending: false });
      data = fallback.data ?? [];
      error = fallback.error ?? null;
    }
    if (error) {
      setLoadError(error.message);
      setReports([]);
      return;
    }
    setReports(((data ?? []) as Parameters<typeof normalizeReport>[0][]).map(normalizeReport));
  }, [allowedTypes.join(',')]);

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [fetchReports])
  );

  // Changes made while the connection was down never arrive live, so the
  // list is read again once it is back (TC_W_Offline_01).
  useOnReconnect(fetchReports);

  useEffect(() => {
    if (allowedTypes.length === 0) return;
    const channel = supabase
      .channel('reports-changes-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        fetchReports();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReports, allowedTypes.join(',')]);

  const openReport = open ? reports.find((report) => report.id === open.id) ?? null : null;

  // The address is worked out from the report's position, for the one report
  // that is open. Doing it for the whole list would mean one paid lookup per
  // report every time the tab is opened.
  useEffect(() => {
    if (!openReport || !mapsLoaded || addressCache[openReport.id]) return;
    if (!hasLocation(openReport) || typeof google === 'undefined') return;
    if (!geocoderRef.current) geocoderRef.current = new google.maps.Geocoder();
    const id = openReport.id;
    geocoderRef.current.geocode({ location: { lat: openReport.lat, lng: openReport.lng } }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        setAddressCache((prev) => ({ ...prev, [id]: results[0].formatted_address }));
      }
    });
  }, [openReport, mapsLoaded, addressCache]);

  // Until the address arrives, and if it never does, the position itself is
  // shown: still enough to find the place.
  const addressText = !openReport
    ? ''
    : !hasLocation(openReport)
      ? 'No location on record'
      : addressCache[openReport.id] ?? `${openReport.lat.toFixed(5)}, ${openReport.lng.toFixed(5)}`;

  const show = (report: Report, mode: OpenReport['mode']) => {
    setOpen({ id: report.id, mode });
    setDetailsDraft(report.details);
    setSaveError(null);
    setSavedNote(null);
    // The panel opens at the top, which may be a long way above the card
    // whose button was pressed.
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const close = () => {
    setOpen(null);
    setDetailsDraft('');
    setSaveError(null);
    setSavedNote(null);
  };

  const handleSave = async () => {
    if (!openReport) return;
    setSaving(true);
    setSaveError(null);
    setSavedNote(null);
    // The title is the first line of what is stored and is not editable, so it
    // is written back exactly as it was. Only what follows it changes.
    const details = detailsDraft.trim();
    const fullContent = details ? `${openReport.title}\n${details}` : openReport.title;
    try {
      const { error } = await supabase.from('reports').update({ content: fullContent }).eq('report_id', openReport.id);
      if (error) throw error;
      await fetchReports();
      setOpen({ id: openReport.id, mode: 'view' });
      setSavedNote('Report updated.');
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Unknown error';
      const hint = /content.*does not exist/i.test(msg)
        ? ' Run supabase/reports-add-content.sql in Supabase SQL Editor to add the content column.'
        : /policy|permission|rls|row level security/i.test(msg)
          ? ' Run supabase/reports-rls-by-service.sql in the Supabase SQL Editor.'
          : '';
      setSaveError(msg + hint);
    } finally {
      setSaving(false);
    }
  };

  const outlineButton = (label: string, onPress: () => void, accessibilityLabel: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.outlineBtn, { borderColor: theme.primary }, pressed && { backgroundColor: theme.primary }]}
    >
      {({ pressed }) => (
        <Text style={[styles.outlineBtnText, { color: pressed ? WHITE : theme.primary }]}>{label}</Text>
      )}
    </Pressable>
  );

  const openStatus = openReport?.status ?? 'pending';
  const reportedAt = openReport ? formatManilaTime(openReport.created_at) : null;

  // The panel rides at the top of the list, not above it, so the two scroll
  // together. Fixed above the list, a tall panel on a short screen left the
  // list a sliver to scroll in and could push its own buttons out of reach.
  const header = (
    <View>
      {openReport && open ? (
        <View style={[styles.card, CardShadow]}>
          <Text style={styles.sectionTitle}>{open.mode === 'edit' ? 'Editing Report' : 'Report Details'}</Text>

          {/* Shown as fields, and greyed, in both modes: the title and the
              address come from the report itself and are never typed here. */}
          <Text style={styles.label}>Title</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>{openReport.title}</Text>
          </View>
          <Text style={styles.label}>Address</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>{addressText}</Text>
          </View>

          {open.mode === 'edit' ? (
            <>
              <Text style={styles.label}>Details</Text>
              <TextInput
                placeholder="Details (stored in report)"
                placeholderTextColor={TEXT_SECONDARY}
                value={detailsDraft}
                onChangeText={setDetailsDraft}
                style={[styles.input, styles.inputMultiline]}
                multiline
              />
              <View style={styles.panelActions}>
                <PrimaryButton title={saving ? 'Saving…' : 'Save Report'} onPress={handleSave} disabled={saving} />
                <Pressable
                  onPress={close}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                  style={styles.plainBtn}
                >
                  <Text style={styles.plainBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.factRow}>
                <Text style={styles.factName}>Type</Text>
                <Text style={styles.factValue}>{emergencyTypeLabel(openReport.classified_as) || 'Not classified'}</Text>
              </View>
              <View style={styles.factRow}>
                <Text style={styles.factName}>Status</Text>
                <Text style={styles.factValue}>{EMERGENCY_STATUS_LABELS[openStatus]}</Text>
              </View>
              <View style={styles.factRow}>
                <Text style={styles.factName}>Reported</Text>
                <Text style={styles.factValue}>{reportedAt ? `${reportedAt} (Manila time)` : 'Time not recorded'}</Text>
              </View>
              <Text style={[styles.label, styles.labelSpaced]}>Details</Text>
              <Text style={styles.detailsText}>{openReport.details || 'No details have been written for this report.'}</Text>

              {savedNote ? (
                <View style={styles.savedBox}>
                  <Text style={styles.savedText}>{savedNote}</Text>
                </View>
              ) : null}

              <View style={styles.panelActions}>
                {outlineButton('Edit', () => show(openReport, 'edit'), 'Edit this report')}
                {openReport.videoUrl
                  ? outlineButton('Open video', () => Linking.openURL(openReport.videoUrl as string), 'Open the report video')
                  : null}
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close report details" style={styles.plainBtn}>
                  <Text style={styles.plainBtnText}>Close</Text>
                </Pressable>
              </View>
            </>
          )}

          {saveError ? (
            <View style={styles.saveErrorBox}>
              <Text style={styles.saveErrorText}>{saveError}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.listTitle}>All Reports</Text>
      {loadError ? (
        <View style={[styles.card, CardShadow, styles.errorCard]}>
          <Text style={styles.errorTitle}>Could not load reports</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorHint}>
            Ensure the reports table has a content column: run supabase/reports-add-content.sql in SQL Editor.
          </Text>
          <PrimaryButton title="Retry" onPress={fetchReports} style={styles.button} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        ListHeaderComponent={header}
        data={reports}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loadError ? <Text style={styles.emptyText}>No emergencies matched to your role right now.</Text> : null
        }
        renderItem={({ item }) => {
          const responderLabel = emergencyTypeLabel(item.classified_as);
          const status = item.status ?? 'pending';
          return (
          <View style={[styles.reportCard, CardShadow, open?.id === item.id && { borderColor: theme.primary }]}>
            <View style={styles.reportHeaderRow}>
              <Text style={styles.reportTitle}>{item.title}</Text>
              <View style={[styles.statusBadge, status === 'resolved' && styles.statusBadgeResolved]}>
                <Text style={[styles.statusBadgeText, status === 'resolved' && styles.statusBadgeTextResolved]}>
                  {EMERGENCY_STATUS_LABELS[status]}
                </Text>
              </View>
            </View>
            {responderLabel ? (
              <Text style={styles.reportResponder}>{responderLabel}</Text>
            ) : null}
            {item.details ? (
              <Text style={styles.reportContent}>{item.details}</Text>
            ) : null}
            {/* No Accept here. A report is accepted on the Map, where doing so
                is logged and the reporter is told. */}
            <View style={styles.actionRow}>
              {outlineButton('View', () => show(item, 'view'), `View ${item.title}`)}
              {outlineButton('Edit', () => show(item, 'edit'), `Edit ${item.title}`)}
            </View>
          </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: Spacing.lg,
    backgroundColor: OFF_WHITE,
  },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.subtitle,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
  },
  labelSpaced: {
    marginTop: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    backgroundColor: WHITE,
    marginBottom: Spacing.md,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: OFF_WHITE,
    marginBottom: Spacing.md,
  },
  readOnlyText: {
    fontSize: FontSizes.body,
    color: TEXT_SECONDARY,
  },
  factRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  factName: {
    width: 72,
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
  },
  factValue: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  detailsText: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
  panelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  plainBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    backgroundColor: WHITE,
  },
  plainBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  savedBox: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: SUCCESS_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: SUCCESS,
  },
  savedText: {
    fontSize: FontSizes.sm,
    color: SUCCESS,
  },
  button: {
    marginTop: Spacing.sm,
  },
  listTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  reportCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: SUCCESS_BG,
  },
  statusBadgeResolved: {
    backgroundColor: OFF_WHITE,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: SUCCESS,
  },
  statusBadgeTextResolved: {
    color: TEXT_SECONDARY,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  reportTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.xs,
    flexShrink: 1,
  },
  reportResponder: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: TEXT_SECONDARY,
    marginBottom: Spacing.xs,
  },
  reportContent: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.md,
  },
  outlineBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  outlineBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  errorCard: {
    marginBottom: Spacing.lg,
    backgroundColor: DANGER_BG,
    borderColor: DANGER_BORDER,
  },
  errorTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: DANGER,
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.sm,
  },
  errorHint: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.md,
  },
  saveErrorBox: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: DANGER_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
  },
  saveErrorText: {
    fontSize: FontSizes.xs,
    color: DANGER,
  },
});
