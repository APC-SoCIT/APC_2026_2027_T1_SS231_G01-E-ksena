import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import {
  Spacing,
  FontSizes,
  Radius,
  WHITE,
  OFF_WHITE,
  BORDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '@/constants/theme';

export const PH_DIAL = '+63';

export function normalizePhone(national: string): string {
  return national.replace(/\D/g, '').replace(/^0+/, '');
}

export function toE164(national: string): string {
  const digits = normalizePhone(national);
  if (!digits) return '';
  return `${PH_DIAL}${digits}`;
}

export function isValidPhone(national: string): boolean {
  const digits = normalizePhone(national);
  return digits.length >= 7 && digits.length <= 12;
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

export function PhoneInput({ value, onChange, placeholder = 'Mobile Number' }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.row, focused && styles.rowActive]}>
      <View style={styles.prefix}>
        <Text style={styles.prefixText}>{PH_DIAL}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^\d\s-]/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={TEXT_SECONDARY}
        keyboardType="phone-pad"
        maxLength={14}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    backgroundColor: WHITE,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  rowActive: {
    borderColor: TEXT_SECONDARY,
  },
  prefix: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    backgroundColor: OFF_WHITE,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  prefixText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    backgroundColor: WHITE,
  },
});
