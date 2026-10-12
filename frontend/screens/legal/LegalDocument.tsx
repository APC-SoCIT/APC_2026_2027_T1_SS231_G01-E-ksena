import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import type { LegalDocumentContent } from './legal-content';

/**
 * Renders a legal document from the shared content file.
 * Restyled to match the E-ksena mobile app theme while strictly
 * preserving the exact legal text from legal-content.ts.
 */
export function LegalDocument({
  title,
  effectiveDate,
  intro,
  sections,
  onBack,
}: LegalDocumentContent & { onBack?: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      {onBack ? (
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backButton}>
            <ArrowLeft size={22} color="#dc2626" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
          <TouchableOpacity onPress={onBack} style={styles.bottomBackBtn}>
            <Text style={styles.bottomBackText}>← Return</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const BRAND_RED = '#dc2626';
const TEXT_PRIMARY = '#1f2937';
const TEXT_SECONDARY = '#6b7280';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_RED,
  },
  scroll: {
    padding: 20,
    paddingBottom: 48,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    color: TEXT_PRIMARY,
    lineHeight: 24,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 14,
    color: BRAND_RED,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: TEXT_PRIMARY,
    lineHeight: 22,
  },
  bottomBackBtn: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  bottomBackText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_RED,
  },
});
