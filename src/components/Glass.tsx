import { BlurTargetView, BlurView } from 'expo-blur';
import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ui/theme';

type TargetRef = RefObject<ComponentRef<typeof View> | null>;

const BlurTargetContext = createContext<TargetRef | null>(null);

/**
 * Zone floutée par les surfaces vitrées (menus contextuels). Sous Android, le flou réel exige
 * une cible explicite : elle englobe l'application, les surfaces vitrées étant rendues au-dessus.
 */
export function GlassTarget({ children, overlay }: { children: ReactNode; overlay: ReactNode }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={styles.fill}>
        {children}
      </BlurTargetView>
      {overlay}
    </BlurTargetContext.Provider>
  );
}

type Props = { radius?: number; intensity?: number; style?: StyleProp<ViewStyle>; children?: ReactNode };

/** Surface en verre dépoli gris : flou d'arrière-plan, voile translucide, liseré clair et ombre douce. */
export function Glass({ radius = 22, intensity = 45, style, children }: Props) {
  const { colors, dark } = useTheme();
  const target = useContext(BlurTargetContext);
  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        <BlurView
          intensity={intensity}
          tint={dark ? 'dark' : 'light'}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={target ?? undefined}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
      </View>
      <View style={[styles.content, { borderRadius: radius, borderColor: colors.glassBorder }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { overflow: 'hidden', borderWidth: 1 },
  shadow: { boxShadow: '0px 14px 32px rgba(0,0,0,0.20)' },
});
