import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnline } from '@/lib/use-online';
import { Spacing, FontSizes, DANGER, DANGER_BG, SUCCESS, SUCCESS_BG } from '@/constants/theme';

const BACK_ONLINE_MS = 4000;

/**
 * A strip across the top of every page while the connection is down
 * (TC_W_Offline_01), and briefly once it is back. Without it, a responder
 * whose network drops sees a map that looks live but is not: no new
 * emergencies arrive, and anything they press fails one error at a time.
 * The Map and Reports screens read their lists again on reconnect.
 */
export function OfflineBanner() {
  const online = useOnline();
  const [justBack, setJustBack] = useState(false);
  const wasOnline = useRef(online);

  useEffect(() => {
    if (online && !wasOnline.current) {
      setJustBack(true);
      const timer = setTimeout(() => setJustBack(false), BACK_ONLINE_MS);
      wasOnline.current = online;
      return () => clearTimeout(timer);
    }
    wasOnline.current = online;
  }, [online]);

  if (online && !justBack) return null;

  return (
    <View
      style={[styles.bar, online ? styles.back : styles.offline]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Text style={[styles.text, { color: online ? SUCCESS : DANGER }]}>
        {online
          ? 'Back online.'
          : 'You are offline. New emergencies will not appear and nothing can be saved until the connection is back.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderBottomWidth: 1 },
  offline: { backgroundColor: DANGER_BG, borderBottomColor: DANGER },
  back: { backgroundColor: SUCCESS_BG, borderBottomColor: SUCCESS },
  text: { fontSize: FontSizes.sm, fontWeight: '600', textAlign: 'center' },
});
