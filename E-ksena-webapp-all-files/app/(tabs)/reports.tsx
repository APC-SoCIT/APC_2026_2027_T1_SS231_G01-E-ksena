import { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, FlatList, Alert, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { Spacing, FontSizes, TEXT_PRIMARY, TEXT_SECONDARY, WHITE, OFF_WHITE, BORDER, Radius, CardShadow, DANGER, DANGER_BG, DANGER_BORDER, SUCCESS, SUCCESS_BG } from '@/constants/theme';
import {
  getEmergencyTypesForRole,
  defaultEmergencyTypeForRole,
  emergencyTypeLabel,
  nextStatusAction,
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
}): Report {
  const id = row.report_id ?? row.id ?? '';
  const content = row.content ?? '';
  const firstLine = content.split('\n')[0]?.trim() || '';
  const rest = content.split('\n').slice(1).join('\n').trim();
  const title = row.title ?? (firstLine || 'Report');
  const details = rest;
  const created_at = row.timestamp ?? row.created_at;
  return {
    id,
    title,
    content,
    details,
    classified_as: row.classified_as,
    status: (row.status as EmergencyStatus) ?? undefined,
    created_at,
  };
}

export default function ReportsScreen() {
  const theme = useRoleTheme();
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pressedEditId, setPressedEditId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleStatusAction = async (report: Report) => {
    const action = nextStatusAction(report.status ?? 'pending');
    if (!action) return;
    const update: Record<string, unknown> = { status: action.next };
    if (action.next === 'responding') {
      update.responder_username = user?.username ?? null;
    }
    const { error } = await supabase.from('reports').update(update).eq('report_id', report.id);
    if (error) {
      Alert.alert('Could not update status', error.message);
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: action.next } : r)));
  };

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Missing details', 'Please enter a title or details for the report.');
      return;
    }
    setSaving(true);
    setLoadError(null);
    setSaveError(null);
    const fullContent = title.trim() ? `${title.trim()}\n${content.trim()}` : content.trim();
    const responsibleType = defaultEmergencyTypeForRole(user?.role);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('reports')
          .update({ content: fullContent })
          .eq('report_id', editingId);
        if (error) throw error;
        Alert.alert('Saved', 'Report updated.');
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const row: Record<string, unknown> = {
          user_id: authData.user?.id ?? null,
          incident_id: null,
          classified_as: responsibleType,
          status: 'matched',
          report_location_lat: 0,
          report_location_lng: 0,
          timestamp: new Date().toISOString(),
          is_processed: false,
          content: fullContent,
        };
        let insertResult = await supabase
          .from('reports')
          .insert([row])
          .select('report_id, classified_as, timestamp, content')
          .single();
        if (insertResult.error && /column.*status.*does not exist/i.test(insertResult.error.message)) {
          const { status: _status, ...rowNoStatus } = row;
          insertResult = await supabase
            .from('reports')
            .insert([rowNoStatus])
            .select('report_id, classified_as, timestamp, content')
            .single();
        }
        if (insertResult.error) throw insertResult.error;
        if (insertResult.data) {
          setReports((prev) => [{ ...normalizeReport(insertResult.data), status: 'matched' }, ...prev]);
        }
        Alert.alert('Saved', 'Report saved.');
      }
      setTitle('');
      setContent('');
      setEditingId(null);
      await fetchReports();
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Unknown error';
      setSaveError(msg);
      const hint = /content.*does not exist/i.test(msg)
        ? ' Run supabase/reports-add-content.sql in Supabase SQL Editor to add the content column.'
        : /policy|permission|rls|row level security/i.test(msg)
          ? ' Run supabase/reports-rls.sql in SQL Editor to allow insert/select.'
          : /foreign key|user_id_fkey|incident_id|null value in column.*(user_id|incident_id)/i.test(msg)
            ? ' Run supabase/reports-allow-null-user.sql in SQL Editor (both user_id and incident_id).'
            : '';
      Alert.alert('Save failed', msg + hint);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.card, CardShadow]}>
        <Text style={styles.sectionTitle}>
          {editingId ? 'Editing Ticket' : 'New Ticket'}
        </Text>
        <Text style={styles.label}>Title</Text>
        <TextInput
          placeholder="Short title (stored in report)"
          placeholderTextColor={TEXT_SECONDARY}
          value={title}
          onChangeText={setTitle}
          style={styles.input}
        />
        <Text style={styles.label}>Details</Text>
        <TextInput
          placeholder="Details (stored in report)"
          placeholderTextColor={TEXT_SECONDARY}
          value={content}
          onChangeText={setContent}
          style={[styles.input, styles.inputMultiline]}
          multiline
        />
        <PrimaryButton title={saving ? 'Saving…' : 'Save Report'} onPress={handleSave} style={styles.button} disabled={saving} />
        {saveError ? (
          <View style={styles.saveErrorBox}>
            <Text style={styles.saveErrorText}>{saveError}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.listTitle}>All Tickets</Text>
      {loadError ? (
        <View style={[styles.card, CardShadow, styles.errorCard]}>
          <Text style={styles.errorTitle}>Could not load tickets</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorHint}>
            Ensure the reports table has a content column: run supabase/reports-add-content.sql in SQL Editor.
          </Text>
          <PrimaryButton title="Retry" onPress={fetchReports} style={styles.button} />
        </View>
      ) : null}
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loadError ? <Text style={styles.emptyText}>No emergencies matched to your role right now.</Text> : null
        }
        renderItem={({ item }) => {
          const responderLabel = emergencyTypeLabel(item.classified_as);
          const status = item.status ?? 'pending';
          const action = nextStatusAction(status);
          return (
          <View style={[styles.reportCard, CardShadow]}>
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
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => {
                  setEditingId(item.id);
                  setTitle(item.title);
                  setContent(item.details);
                }}
                onPressIn={() => setPressedEditId(item.id)}
                onPressOut={() => setPressedEditId(null)}
                style={({ pressed }) => [
                  styles.editBtn,
                  { borderColor: theme.primary },
                  pressed && [styles.editBtnPressed, { backgroundColor: theme.primary }],
                ]}
              >
                <Text style={[
                  styles.editBtnText,
                  { color: theme.primary },
                  pressedEditId === item.id && styles.editBtnTextPressed,
                ]}>
                  Edit
                </Text>
              </Pressable>
              {action ? (
                <Pressable
                  onPress={() => handleStatusAction(item)}
                  style={[styles.statusBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.statusBtnText}>{action.label}</Text>
                </Pressable>
              ) : null}
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
  statusBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  statusBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: WHITE,
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
  editBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  editBtnPressed: {},
  editBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  editBtnTextPressed: {
    color: WHITE,
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