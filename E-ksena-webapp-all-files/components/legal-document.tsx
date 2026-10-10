import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
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
} from '@/constants/theme';
import type { LegalDocumentContent } from '@/constants/legal-content';

// The wording lives in constants/legal-content.ts so the mobile app can share
// it verbatim. This file only decides how it looks.
//
// Twelve numbered sections of continuous prose is how a policy goes unread.
// Three things work against that here: an index, so a reader can go straight
// to the part they came for; numbered markers, so they can tell where they
// are; and a callout for the two clauses that cause harm when missed.
export function LegalDocument({ title, effectiveDate, intro, sections }: LegalDocumentContent) {
  const scrollRef = useRef<ScrollView | null>(null);
  const cardTop = useRef(0);
  const sectionTops = useRef<Record<number, number>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Section offsets are measured relative to the card, so the card's own
  // offset has to be added before scrolling. Both arrive via onLayout rather
  // than being calculated, because wrapped headings change the height.
  const jumpTo = (index: number) => {
    const y = sectionTops.current[index];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(cardTop.current + y - Spacing.lg, 0), animated: true });
    setActiveIndex(index);
  };

  const measureSection = (index: number) => (event: LayoutChangeEvent) => {
    sectionTops.current[index] = event.nativeEvent.layout.y;
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[styles.card, CardShadow]}
        onLayout={(event) => {
          cardTop.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={styles.accent} />

        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.datePill}>
            <Text style={styles.dateText}>Effective {effectiveDate}</Text>
          </View>

          <Text style={styles.intro}>{intro}</Text>

          <View style={styles.divider} />

          <Text style={styles.tocLabel}>On this page</Text>
          <View style={styles.toc}>
            {sections.map((section, index) => (
              <Pressable
                key={section.heading}
                onPress={() => jumpTo(index)}
                hitSlop={4}
                style={({ pressed }) => [styles.tocRow, pressed && styles.tocRowPressed]}
              >
                <Text style={styles.tocNumber}>{index + 1}</Text>
                <Text
                  style={[styles.tocText, activeIndex === index && styles.tocTextActive]}
                  numberOfLines={2}
                >
                  {section.heading}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.divider} />

          {sections.map((section, index) => (
            <View
              key={section.heading}
              onLayout={measureSection(index)}
              style={[styles.section, section.emphasis && styles.sectionCallout]}
            >
              <View style={styles.headingRow}>
                <View style={[styles.badge, section.emphasis && styles.badgeCallout]}>
                  <Text style={[styles.badgeText, section.emphasis && styles.badgeTextCallout]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={styles.heading}>{section.heading}</Text>
              </View>

              {section.paragraphs?.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}

              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.divider} />

          <Pressable
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            hitSlop={8}
            style={({ pressed }) => [styles.topBtn, pressed && styles.topBtnPressed]}
          >
            <Text style={styles.topBtnText}>Back to top</Text>
          </Pressable>
        </View>
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  accent: {
    height: 4,
    backgroundColor: BRAND_RED,
  },
  body: {
    padding: Platform.OS === 'web' ? Spacing.xl : Spacing.lg,
  },
  title: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
  },
  datePill: {
    alignSelf: 'flex-start',
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.sm,
    paddingVertical: 3,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dateText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  intro: {
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    lineHeight: 26,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: Spacing.lg,
  },
  tocLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: TEXT_SECONDARY,
    marginBottom: Spacing.sm,
  },
  toc: {
    gap: 2,
  },
  tocRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: 5,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.sm,
  },
  tocRowPressed: {
    backgroundColor: OFF_WHITE,
  },
  tocNumber: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: BRAND_RED,
    minWidth: 16,
    lineHeight: 20,
  },
  tocText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
  tocTextActive: {
    color: BRAND_RED,
    fontWeight: '600',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionCallout: {
    backgroundColor: DANGER_BG,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    borderLeftWidth: 3,
    borderLeftColor: BRAND_RED,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: OFF_WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCallout: {
    backgroundColor: BRAND_RED,
    borderColor: BRAND_RED,
  },
  badgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: TEXT_SECONDARY,
  },
  badgeTextCallout: {
    color: WHITE,
  },
  heading: {
    flex: 1,
    fontSize: FontSizes.body,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  paragraph: {
    fontSize: FontSizes.sm,
    color: TEXT_PRIMARY,
    lineHeight: 23,
    marginBottom: Spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingLeft: Spacing.xs,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: BRAND_RED,
    marginTop: 9,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: TEXT_PRIMARY,
    lineHeight: 23,
  },
  topBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: WHITE,
  },
  topBtnPressed: {
    backgroundColor: OFF_WHITE,
  },
  topBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: BRAND_RED,
  },
});
