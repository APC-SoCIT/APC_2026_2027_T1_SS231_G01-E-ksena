import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontSizes } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const textColor = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const linkColor = useThemeColor({}, 'tint');

  return (
    <Text
      style={[
        { color: type === 'link' ? linkColor : textColor },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: FontSizes.body,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: FontSizes.body,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    lineHeight: 34,
  },
  subtitle: {
    fontSize: FontSizes.subtitle,
    fontWeight: '600',
  },
  link: {
    lineHeight: 24,
    fontSize: FontSizes.body,
  },
});