import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/** Fond d'origine du logo officiel : le logo est présenté sur sa plaque, en clair comme en sombre. */
const LOGO_BACKGROUND = '#F8F9FA';
const LOGO_RATIO = 772 / 743;

/** Logo complet OpenPlay (pictogramme + nom), tel que fourni, sans recoloration. */
export function BrandLogo({ width = 180 }: { width?: number }) {
  return (
    <View style={[styles.plate, { width: width + 24 }]} accessibilityRole="image" accessibilityLabel="OpenPlay">
      <Image source={require('../../assets/brand/openplay-logo-full.png')} style={{ width, height: width / LOGO_RATIO }} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: LOGO_BACKGROUND,
    borderRadius: 28,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
});
