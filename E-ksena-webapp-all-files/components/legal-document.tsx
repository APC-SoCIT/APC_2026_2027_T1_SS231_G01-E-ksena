import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
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
} from '@/constants/theme';

/**
 * The address a data subject writes to in order to exercise their rights under
 * the Data Privacy Act. The law requires a reachable contact, so this must be a
 * mailbox the group actually monitors -- not a personal address that stops
 * being read once the term ends.
 */
export const PRIVACY_CONTACT_EMAIL = 'SET-YOUR-GROUP-EMAIL@apc.edu.ph';

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

type Props = {
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
};

export function LegalDocument({ title, effectiveDate, intro, sections }: Props) {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, CardShadow]}>
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
                <Text style={styles.bulletDot}>{'\u2022'}</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingVertical: Spacing.xl,
    backgroundColor: OFF_WHITE,
  },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Platform.OS === 'web' ? Spacing.xl : Spacing.lg,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.xs,
  },
  meta: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.lg,
  },
  intro: {
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  heading: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
  },
  paragraph: {
    fontSize: FontSizes.sm,
    color: TEXT_PRIMARY,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingLeft: Spacing.xs,
  },
  bulletDot: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: TEXT_PRIMARY,
    lineHeight: 22,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  backText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: BRAND_RED,
  },
});
