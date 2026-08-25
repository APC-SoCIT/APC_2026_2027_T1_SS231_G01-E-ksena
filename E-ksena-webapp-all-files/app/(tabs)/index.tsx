import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { GoogleMap, useJsApiLoader, Marker, DirectionsService, DirectionsRenderer, OverlayView } from '@react-google-maps/api';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
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
  DANGER_BG,
  DANGER_BORDER,
  SUCCESS,
  SUCCESS_BG,
} from '@/constants/theme';
import { MAKATI_CENTER, isWithinMakati, haversineKm } from '@/lib/makati';
import {
  getEmergencyTypesForRole,
  emergencyTypeLabel,
  nextStatusAction,
  EMERGENCY_STATUS_LABELS,
  type EmergencyStatus,
} from '@/lib/emergency';

interface EmergencyReport {
  id: string;
  lat: number;
  lng: number;
  classified_as?: string;
  status: EmergencyStatus;
  timestamp?: string;
}

function hasValidCoords(lat: number | null, lng: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    !(lat === 0 && lng === 0) &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng)
  );
}

const MARKER_ICON_BY_STATUS: Record<string, string> = {
  matched: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
  responding: 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png',
  pending: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
};
const RESPONDER_ICON = 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';

export default function MapScreen() {
  const { user } = useAuth();
  const theme = useRoleTheme();
  const allowedTypes = useMemo(() => getEmergencyTypesForRole(user?.role), [user?.role]);

  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [responderLocation, setResponderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [addressCache, setAddressCache] = useState<Record<string, string>>({});
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsFailed, setDirectionsFailed] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const mapHeight = 640;
  const containerStyle = useMemo(() => ({ width: '100%', height: mapHeight }), [mapHeight]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: 'AIzaSyBGmlFmGPmmxmkkU-9NU-h_Tb_QDjg4aMo',
  });

  const visibleReports = useMemo(() => reports.filter((r) => !dismissedIds.has(r.id)), [reports, dismissedIds]);

  const selectedReport = useMemo(
    () => visibleReports.find((r) => r.id === selectedId) ?? null,
    [visibleReports, selectedId]
  );

  const mapCenter = useMemo(() => {
    if (selectedReport) return { lat: selectedReport.lat, lng: selectedReport.lng };
    return MAKATI_CENTER;
  }, [selectedReport]);

  const fetchReports = useCallback(async () => {
    setFetchError(null);
    if (allowedTypes.length === 0) {
      setReports([]);
      return;
    }
    const selectCols = 'report_id, report_location_lat, report_location_lng, classified_as, status, timestamp';
    let data: unknown[] | null = null;
    let error: { message: string } | null = null;

    const first = await supabase
      .from('reports')
      .select(selectCols)
      .in('classified_as', allowedTypes)
      .neq('status', 'resolved');
    data = first.data;
    error = first.error;

    if (error && /column.*status.*does not exist/i.test(error.message)) {
      const fallback = await supabase
        .from('reports')
        .select('report_id, report_location_lat, report_location_lng, classified_as, timestamp')
        .in('classified_as', allowedTypes);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      setFetchError(error.message);
      return;
    }

    const locations: EmergencyReport[] = [];
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const lat = row.report_location_lat as number | null;
      const lng = row.report_location_lng as number | null;
      if (!hasValidCoords(lat, lng)) continue;
      if (!isWithinMakati(lat, lng)) continue; // defensive: never dispatch/show outside Makati

      locations.push({
        id: String(row.report_id ?? ''),
        lat: Number(lat),
        lng: Number(lng),
        classified_as: row.classified_as as string | undefined,
        status: ((row.status as EmergencyStatus) ?? 'matched'),
        timestamp: row.timestamp as string | undefined,
      });
    }
    setReports(locations);
  }, [allowedTypes.join(',')]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [fetchReports])
  );

  useEffect(() => {
    if (allowedTypes.length === 0) return;
    const channel = supabase
      .channel('reports-changes-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        fetchReports();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReports, allowedTypes.join(',')]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 },
          (loc) => {
            if (cancelled) return;
            setResponderLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        );
      } catch {

      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    setDirectionsResult(null);
    setDirectionsFailed(false);
    setStatusError(null);
  }, [selectedId]);

  useEffect(() => {
    if (selectedReport?.status !== 'responding') return;
    setDirectionsResult(null);
    setDirectionsFailed(false);

  }, [responderLocation?.lat, responderLocation?.lng]);

  useEffect(() => {
    if (!selectedReport || !isLoaded || addressCache[selectedReport.id]) return;
    if (typeof google === 'undefined') return;
    if (!geocoderRef.current) geocoderRef.current = new google.maps.Geocoder();
    geocoderRef.current.geocode(
      { location: { lat: selectedReport.lat, lng: selectedReport.lng } },
      (results, status) => {
        if (status === 'OK' && results && results[0]) {
          setAddressCache((prev) => ({ ...prev, [selectedReport.id]: results[0].formatted_address }));
        }
      }
    );
  }, [selectedReport, isLoaded, addressCache]);

  const responderInMakati = responderLocation ? isWithinMakati(responderLocation.lat, responderLocation.lng) : false;
  const shouldRoute = !!selectedReport && !!responderLocation && responderInMakati && !directionsResult && !directionsFailed;

  const straightLineKm = useMemo(() => {
    if (!selectedReport || !responderLocation) return null;
    return haversineKm(responderLocation.lat, responderLocation.lng, selectedReport.lat, selectedReport.lng);
  }, [selectedReport, responderLocation]);

  const routeMidpoint = useMemo(() => {
    const path = directionsResult?.routes?.[0]?.overview_path;
    if (!path || path.length === 0) return null;
    const mid = path[Math.floor(path.length / 2)];
    return { lat: mid.lat(), lng: mid.lng() };
  }, [directionsResult]);

  const handleStatusAction = async (report: EmergencyReport) => {
    const action = nextStatusAction(report.status);
    if (!action) return;
    setStatusError(null);
    const update: Record<string, unknown> = { status: action.next };
    if (action.next === 'responding') {
      update.responder_username = user?.username ?? null;
    }
    const { error } = await supabase.from('reports').update(update).eq('report_id', report.id);
    if (error) {
      const hint = /(status|responder_username).*column|column.*(status|responder_username)/i.test(error.message)
        ? ' Run supabase/reports-add-status.sql in the Supabase SQL Editor to add the missing columns.'
        : '';
      setStatusError(error.message + hint);
      Alert.alert('Could not update status', error.message + hint);
      return;
    }
    if (action.next === 'resolved') {
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setSelectedId(null);
    } else {
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: action.next } : r)));
    }
  };

  const handleDecline = (report: EmergencyReport) => {
    setDismissedIds((prev) => new Set(prev).add(report.id));
    setSelectedId((current) => (current === report.id ? null : current));
  };

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Map Error: {loadError.message}</Text>
      </View>
    );
  }

  const route = directionsResult?.routes?.[0]?.legs?.[0];

  const mapPane = (
    <View style={[styles.mapFrame, { height: mapHeight }]}>
      {isLoaded ? (
        <GoogleMap mapContainerStyle={containerStyle} center={mapCenter} zoom={selectedReport ? 16 : 13}>
          {visibleReports.map((r) => (
            <Marker
              key={r.id}
              position={{ lat: r.lat, lng: r.lng }}
              title={emergencyTypeLabel(r.classified_as)}
              icon={MARKER_ICON_BY_STATUS[r.status] ?? MARKER_ICON_BY_STATUS.matched}
              onClick={() => setSelectedId(r.id)}
            />
          ))}
          {responderLocation ? (
            <Marker position={responderLocation} title="Your location" icon={RESPONDER_ICON} />
          ) : null}
          {shouldRoute && selectedReport && responderLocation ? (
            <DirectionsService
              options={{
                origin: responderLocation,
                destination: { lat: selectedReport.lat, lng: selectedReport.lng },
                travelMode: google.maps.TravelMode.DRIVING,
              }}
              callback={(result, status) => {
                if (status === 'OK' && result) setDirectionsResult(result);
                else setDirectionsFailed(true);
              }}
            />
          ) : null}
          {directionsResult ? (
            <DirectionsRenderer
              options={{
                directions: directionsResult,
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: theme.primary,
                  strokeWeight: 6,
                  strokeOpacity: 0.9,
                },
              }}
            />
          ) : null}
          {directionsResult && routeMidpoint && route ? (
            <OverlayView
              position={routeMidpoint}
              mapPaneName={OverlayView.OVERLAY_LAYER}
              getPixelPositionOffset={(width, height) => ({ x: -(width / 2), y: -(height + 8) })}
            >
              <View
                style={[styles.routeBubble, { borderColor: theme.primary }]}
                pointerEvents="none"
              >
                <Text style={[styles.routeBubbleTime, { color: theme.primary }]}>{route.duration?.text}</Text>
                <Text style={styles.routeBubbleDistance}>{route.distance?.text}</Text>
              </View>
            </OverlayView>
          ) : null}
        </GoogleMap>
      ) : (
        <ActivityIndicator size="large" color={BRAND_RED} />
      )}
    </View>
  );

  const locationText = selectedReport
    ? addressCache[selectedReport.id] ?? `${selectedReport.lat.toFixed(5)}, ${selectedReport.lng.toFixed(5)}`
    : '';
  const distanceText = route?.distance?.text ?? (straightLineKm != null ? `~${straightLineKm.toFixed(2)} km` : '—');
  const etaText = route?.duration?.text ?? '—';

  const selectedCard = selectedReport ? (
    <View style={[styles.card, CardShadow, styles.selectedCard]}>
      {selectedReport.status === 'matched' ? (

        <>
          <View style={[styles.matchPill, { borderColor: theme.primary }]}>
            <Text style={[styles.matchPillText, { color: theme.primary }]}>New Emergency Match</Text>
          </View>
          <View style={styles.reportHeaderRow}>
            <Text style={styles.selectedTitle}>{emergencyTypeLabel(selectedReport.classified_as)}</Text>
            {route?.duration?.text ? <Text style={styles.etaAway}>{route.duration.text} away</Text> : null}
          </View>
          <Text style={styles.selectedDetail}>{locationText}</Text>
          {responderLocation && !responderInMakati ? (
            <Text style={styles.hintText}>Your current location is outside Makati City, so routing is unavailable.</Text>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>DISTANCE</Text>
              <Text style={styles.statValue}>{distanceText}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>EST. TRAVEL TIME</Text>
              <Text style={styles.statValue}>{etaText}</Text>
            </View>
          </View>

          {statusError ? <Text style={styles.statusErrorText}>{statusError}</Text> : null}

          <View style={styles.acceptRow}>
            <Pressable onPress={() => handleDecline(selectedReport)} style={styles.declineBtn}>
              <Text style={styles.declineBtnText}>Decline</Text>
            </Pressable>
            <Pressable
              onPress={() => handleStatusAction(selectedReport)}
              style={[styles.acceptBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.acceptBtnText}>Accept</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={styles.reportHeaderRow}>
            <Text style={styles.selectedTitle}>{emergencyTypeLabel(selectedReport.classified_as)}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{EMERGENCY_STATUS_LABELS[selectedReport.status]}</Text>
            </View>
          </View>
          <Text style={styles.selectedDetail}>Location: {locationText}</Text>
          {responderLocation && !responderInMakati ? (
            <Text style={styles.hintText}>Your current location is outside Makati City, so routing is unavailable.</Text>
          ) : null}
          {selectedReport.status === 'responding' ? (
            <Text style={styles.hintText}>Tracking your live location as you head to the scene.</Text>
          ) : null}
          {route ? (
            <Text style={styles.selectedDetail}>
              Route: {route.distance?.text} · ETA {route.duration?.text}
            </Text>
          ) : directionsFailed && straightLineKm != null ? (
            <Text style={styles.selectedDetail}>
              Straight-line distance: ~{straightLineKm.toFixed(2)} km (turn-by-turn route unavailable)
            </Text>
          ) : null}
          {statusError ? <Text style={styles.statusErrorText}>{statusError}</Text> : null}
          {nextStatusAction(selectedReport.status) ? (
            <Pressable
              onPress={() => handleStatusAction(selectedReport)}
              style={[styles.statusBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.statusBtnText}>{nextStatusAction(selectedReport.status)?.label}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  ) : null;

  const emergencyList = (
    <>
      <Text style={styles.listTitle}>Active Emergencies ({visibleReports.length})</Text>
      {visibleReports.length === 0 ? (
        <Text style={styles.emptyText}>No active emergencies matched to your role right now.</Text>
      ) : (
        visibleReports.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setSelectedId(r.id)}
            style={[
              styles.listCard,
              CardShadow,
              r.id === selectedId && { borderColor: theme.primary },
            ]}
          >
            <Text style={styles.listCardTitle}>{emergencyTypeLabel(r.classified_as)}</Text>
            <Text style={styles.listCardSubtitle}>{EMERGENCY_STATUS_LABELS[r.status]}</Text>
          </Pressable>
        ))
      )}
    </>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Incidents</Text>
      <Text style={styles.subtitle}>Active emergencies matched to {theme.displayName} within Makati City</Text>

      {fetchError ? (
        <View style={[styles.card, CardShadow, styles.errorCard]}>
          <Text style={styles.errorText}>Could not load reports: {fetchError}</Text>
          <Text style={styles.errorHint}>Check the connection and try again.</Text>
        </View>
      ) : null}

      <View style={styles.dashboardRow}>
        <View style={styles.mapColumn}>{mapPane}</View>
        <View style={[styles.sidebarColumn, { height: mapHeight }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {selectedCard}
            {emergencyList}
          </ScrollView>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: OFF_WHITE,
  },
  container: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
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
    marginBottom: Spacing.md,
  },
  dashboardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  mapColumn: {
    flex: 1.6,
    minWidth: 0,
  },
  sidebarColumn: {
    flex: 1,
    maxWidth: 380,
  },
  mapFrame: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    minHeight: 300,
    backgroundColor: WHITE,
    marginBottom: Spacing.md,
  },
  routeBubble: {
    backgroundColor: WHITE,
    borderWidth: 2,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  routeBubbleTime: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  routeBubbleDistance: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
  },
  card: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
  },
  selectedCard: {
    marginTop: 0,
    marginBottom: Spacing.lg,
  },
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  selectedTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    flexShrink: 1,
  },
  selectedDetail: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: SUCCESS_BG,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: SUCCESS,
  },
  statusBtn: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  statusBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: WHITE,
  },
  matchPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  matchPillText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  etaAway: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: Spacing.md,
    marginVertical: Spacing.md,
  },
  statBlock: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: BORDER,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    letterSpacing: 0.3,
    marginBottom: Spacing.xs,
  },
  statValue: {
    fontSize: FontSizes.subtitle,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  acceptRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  declineBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  declineBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  acceptBtn: {
    flex: 1.4,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  acceptBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: WHITE,
  },
  listTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.md,
  },
  listCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  listCardTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  listCardSubtitle: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  errorCard: {
    backgroundColor: DANGER_BG,
    borderColor: DANGER_BORDER,
  },
  errorHint: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginTop: Spacing.sm,
  },
  hintText: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    fontStyle: 'italic',
    marginBottom: Spacing.xs,
  },
  statusErrorText: {
    fontSize: FontSizes.xs,
    color: BRAND_RED,
    marginBottom: Spacing.xs,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DANGER_BG,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
  },
  errorText: {
    fontSize: FontSizes.body,
    color: BRAND_RED,
    padding: Spacing.md,
    textAlign: 'center',
  },
});