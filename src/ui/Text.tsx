import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from './theme';

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
};

const VARIANTS = {
  largeTitle: { fontFamily: FONT.heavy, fontSize: 34, lineHeight: 41, letterSpacing: -0.8 },
  title1: { fontFamily: FONT.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  title2: { fontFamily: FONT.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  title3: { fontFamily: FONT.semibold, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  headline: { fontFamily: FONT.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: FONT.regular, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  callout: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 21, letterSpacing: -0.15 },
  subhead: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  footnote: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: FONT.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'inverse' | 'danger';

type Props = TextProps & { variant?: TextVariant; tone?: TextTone; weight?: keyof typeof FONT; color?: string };

export function Text({ variant = 'body', tone = 'primary', weight, color, style, ...rest }: Props) {
  const { colors } = useTheme();
  const toneColor = {
    primary: colors.text,
    secondary: colors.secondaryText,
    tertiary: colors.tertiaryText,
    accent: colors.accent,
    inverse: colors.background,
    danger: colors.danger,
  }[tone];
  return (
    <RNText
      {...rest}
      style={[VARIANTS[variant], { color: color ?? toneColor }, weight && { fontFamily: FONT[weight] }, style]}
    />
  );
}
