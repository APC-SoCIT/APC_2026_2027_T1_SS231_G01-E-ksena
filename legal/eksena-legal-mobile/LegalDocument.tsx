import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import type { LegalDocumentContent } from './legal-content';

/**
 * Renders a legal document from the shared content file.
 *
 * Deliberately plain React Native: no navigation library, no path aliases and
 * no theme import, so it drops into the mobile app without pulling anything
 * else along. Restyle it to match the app -- but do not edit the wording here,
 * because the wording lives in legal-content.ts and is shared with the web
 * dashboard.
 *
 * Pass onBack to show a back control; leave it out if the screen already has
 * a header with one.
 */
export function LegalDocument({
  title,
  effectiveDate,
  intro,
  sections,
  onBack,
}: LegalDocumentContent & { onBack?: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>Effective {effectiveDate}</Text>
      <Text style={styles.intro}>{intro}</Text>

      {sections.map((section, index) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading}>
            {index + 1}. {section.heading}
          </Text>

          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}

          {section.bullets?.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>{'•'}</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      ))}

      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const BRAND_RED = '#9B1C1C';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECONDARY = '#6B7280';

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48, backgroundColor: '#FFFFFF' },
  title: { fontSize: 24, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 4 },
  meta: { fontSize: 12, color: TEXT_SECONDARY, marginBottom: 20 },
  intro: { fontSize: 15, color: TEXT_PRIMARY, lineHeight: 24, marginBottom: 20 },
  section: { marginBottom: 20 },
  heading: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 8 },
  paragraph: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 4, paddingLeft: 4 },
  bulletDot: { fontSize: 14, color: TEXT_SECONDARY, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22 },
  backBtn: { alignSelf: 'flex-start', marginTop: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: BRAND_RED },
});
