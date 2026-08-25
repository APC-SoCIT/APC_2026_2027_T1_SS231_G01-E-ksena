import { useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/primary-button';
import { useRoleTheme } from '@/context/role-theme';
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
  BRAND_RED_SUBTLE,
  DANGER_BG,
  DANGER_BORDER,
  SUCCESS,
  SUCCESS_BG,
} from '@/constants/theme';
import { EMERGENCY_TYPES, matchResponderRole, emergencyTypeLabel } from '@/lib/emergency';
import { getRoleTheme } from '@/constants/theme';
import { MAKATI_CENTER, isWithinMakati } from '@/lib/makati';
import { GOOGLE_MAPS_API_KEY } from '@/lib/env';

const MAP_CONTAINER_STYLE = { width: '100%', height: 280 };

export default function ExploreScreen() {
  const theme = useRoleTheme();
  const [emergencyType, setEmergencyType] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const pinInMakati = pin ? isWithinMakati(pin.lat, pin.lng) : true;

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    setPin({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  const handleSubmit = async (): Promise<void> => {
    setFormError(null);
    setSuccessMessage(null);
    if (!emergencyType) {
      setFormError('Choose the type of emergency before submitting.');
      return;
    }
    if (!message.trim()) {
      setFormError('Please enter the report details.');
      return;
    }
    if (!pin) {
      setFormError('Tap the map to mark where the emergency is happening.');
      return;
    }
    if (!isWithinMakati(pin.lat, pin.lng)) {
      setFormError(
        'E-ksena currently only supports emergencies within Makati City. The marked location is outside the service area, so it cannot be dispatched.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const matchedRole = matchResponderRole(emergencyType);
      const content = phone.trim() ? `Phone: ${phone.trim()}\n${message.trim()}` : message.trim();

      const row: Record<string, unknown> = {
        content,
        classified_as: emergencyType,
        report_location_lat: pin.lat,
        report_location_lng: pin.lng,
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
      setSuccessMessage(`This ${emergencyTypeLabel(emergencyType)} report has been matched to ${roleLabel}.`);
      setEmergencyType(null);
      setPhone('');
      setMessage('');
      setPin(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
      const hint = /column.*status.*does not exist/i.test(msg)
        ? ' Run supabase/reports-emergency-workflow.sql in Supabase SQL Editor to add the status column.'
        : /policy|permission|rls|row level security/i.test(msg)
          ? ' Run supabase/reports-rls.sql in SQL Editor to allow insert/select.'
          : '';
      setFormError(msg + hint);
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

        <Text style={styles.label}>Location</Text>
        <Text style={styles.helperText}>Tap the map where the caller said the emergency is happening.</Text>
        <View style={styles.mapFrame}>
          {loadError ? (
            <Text style={styles.mapErrorText}>Map failed to load: {loadError.message}</Text>
          ) : isLoaded ? (
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={pin ?? MAKATI_CENTER}
              zoom={pin ? 16 : 13}
              onClick={handleMapClick}
            >
              {pin ? <Marker position={pin} /> : null}
            </GoogleMap>
          ) : (
            <ActivityIndicator size="large" color={BRAND_RED} />
          )}
        </View>
        {pin ? (
          <Text style={[styles.pinText, !pinInMakati && styles.pinTextWarning]}>
            {pinInMakati
              ? `Marked: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
              : 'That point is outside Makati City — tap again inside the service area.'}
          </Text>
        ) : (
          <Text style={styles.pinText}>No location marked yet.</Text>
        )}

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

        {formError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}
        {successMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

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
  helperText: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
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
  mapFrame: {
    height: 280,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapErrorText: {
    fontSize: FontSizes.sm,
    color: BRAND_RED,
    padding: Spacing.md,
    textAlign: 'center',
  },
  pinText: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  pinTextWarning: {
    color: BRAND_RED,
    fontWeight: '600',
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
  errorBox: {
    backgroundColor: DANGER_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: BRAND_RED,
  },
  successBox: {
    backgroundColor: SUCCESS_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: SUCCESS,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  successText: {
    fontSize: FontSizes.sm,
    color: SUCCESS,
  },
  button: {
    marginTop: Spacing.sm,
  },
});
