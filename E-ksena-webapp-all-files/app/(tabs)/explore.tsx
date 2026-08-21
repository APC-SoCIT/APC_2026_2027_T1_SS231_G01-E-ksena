import { useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, Alert, Pressable } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { useRoleTheme } from '@/context/role-theme';
import {
  Spacing,
  FontSizes,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
  OFF_WHITE,
  BORDER,
  Radius,
  CardShadow,
  BRAND_RED_SUBTLE,
} from '@/constants/theme';
import { EMERGENCY_TYPES, matchResponderRole, emergencyTypeLabel } from '@/lib/emergency';
import { getRoleTheme } from '@/constants/theme';
import { isWithinMakati } from '@/lib/makati';

export default function ExploreScreen() {
  const theme = useRoleTheme();
  const [emergencyType, setEmergencyType] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    if (!emergencyType) {
      Alert.alert('Select emergency type', 'Choose the type of emergency before submitting.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Missing details', 'Please enter the report details.');
      return;
    }

    setSubmitting(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location is required to validate the emergency is within Makati City.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      if (!isWithinMakati(lat, lng)) {
        Alert.alert(
          'Outside Service Area',
          'E-ksena currently only supports emergencies within Makati City. This location is outside the service area, so it cannot be dispatched.'
        );
        return;
      }

      const matchedRole = matchResponderRole(emergencyType);
      const content = phone.trim() ? `Phone: ${phone.trim()}\n${message.trim()}` : message.trim();

      const row: Record<string, unknown> = {
        content,
        classified_as: emergencyType,
        report_location_lat: lat,
        report_location_lng: lng,
        status: 'matched',
        timestamp: new Date().toISOString(),
        is_processed: false,
        user_id: null,
        incident_id: null,
      };
      let { error } = await supabase.from('reports').insert([row]);
      if (error && /column.*status.*does not exist/i.test(error.message)) {
        const { status: _status, ...rowNoStatus } = row;
        const retry = await supabase.from('reports').insert([rowNoStatus]);
        error = retry.error;
      }
      if (error) throw error;

      const roleLabel = matchedRole ? getRoleTheme(matchedRole).displayName : 'a responder';
      Alert.alert('Report Matched', `This ${emergencyTypeLabel(emergencyType)} report has been matched to ${roleLabel}.`);
      setEmergencyType(null);
      setPhone('');
      setMessage('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = /column.*status.*does not exist/i.test(msg)
        ? ' Run supabase/reports-emergency-workflow.sql in Supabase SQL Editor to add the status column.'
        : /policy|permission|rls|row level security/i.test(msg)
          ? ' Run supabase/reports-rls.sql in SQL Editor to allow insert/select.'
          : '';
      Alert.alert('Could not submit report', msg + hint);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, CardShadow]}>
        <Text style={styles.title}>Log Incoming Report</Text>
        <Text style={styles.subtitle}>
          Record a report received by phone or SMS. The emergency type determines which responder it gets matched to.
        </Text>

        <Text style={styles.label}>Emergency Type</Text>
        <View style={styles.typeRow}>
          {EMERGENCY_TYPES.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setEmergencyType(t.key)}
              style={[
                styles.typeBtn,
                emergencyType === t.key && { borderColor: theme.primary, backgroundColor: BRAND_RED_SUBTLE },
              ]}
            >
              <Text style={[styles.typeBtnText, emergencyType === t.key && { color: theme.primary, fontWeight: '600' }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          placeholder="Phone Number (optional)"
          placeholderTextColor={TEXT_SECONDARY}
          value={phone}
          onChangeText={setPhone}
          style={styles.input}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Message Content</Text>
        <TextInput
          placeholder="Message Content"
          placeholderTextColor={TEXT_SECONDARY}
          value={message}
          onChangeText={setMessage}
          multiline
          style={[styles.input, styles.inputMultiline]}
        />

        <PrimaryButton
          title={submitting ? 'Submitting…' : 'Send Report'}
          onPress={handleSubmit}
          style={styles.button}
          disabled={submitting}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    backgroundColor: OFF_WHITE,
  },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.subtitle,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  typeBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: BORDER,
  },
  typeBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: TEXT_SECONDARY,
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
    minHeight: 100,
    textAlignVertical: 'top',
  },
  button: {
    marginTop: Spacing.sm,
  },
});