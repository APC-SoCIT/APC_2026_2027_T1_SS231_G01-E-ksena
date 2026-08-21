import { Pressable, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { Spacing, FontSizes, WHITE, Radius } from '@/constants/theme';
import { useRoleTheme } from '@/context/role-theme';

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;

  color?: string;
  hoverColor?: string;
};

export function PrimaryButton({ title, onPress, style, textStyle, disabled, color, hoverColor }: PrimaryButtonProps) {
  const theme = useRoleTheme();
  const bg = color ?? theme.primary;
  const bgHover = hoverColor ?? theme.primaryHover;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        pressed && [styles.buttonPressed, { backgroundColor: bgHover }],
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text style={[styles.label, textStyle]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  buttonPressed: {
    opacity: 0.95,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  label: {
    color: WHITE,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});