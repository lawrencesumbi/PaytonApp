import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../constants/theme';

// ---- Configuration ----
interface NavItem {
  key: string;
  icon: any; // Using any for the icon keys to stop the TypeScript redlines
  activeIcon: any;
  isCenter?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'budget', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'scan', icon: 'scan-outline', activeIcon: 'scan', isCenter: true },
  { key: 'split', icon: 'broken-wallet', activeIcon: 'broken-wallet' },
  { key: 'profile', icon: 'person-outline', activeIcon: 'person' },
];

const { width: SCREEN_W } = Dimensions.get('window');
const H_MARGIN = 14;
const NAV_WIDTH = SCREEN_W - (H_MARGIN * 2);
const BAR_HEIGHT = 60;
const BUMP_HEIGHT = 20;
const BUTTON_SIZE = 64;
const SVG_HEIGHT = BAR_HEIGHT + BUMP_HEIGHT;
const BUTTON_POKE = 7;
const WRAPPER_HEIGHT = SVG_HEIGHT + BUTTON_POKE;
const MINI_SIZE = 56;

// Palette (with fallbacks to prevent undefined errors)
const GLASS_TINT = 'rgba(255,255,255,0.32)';
const GLASS_RIM = 'rgba(255,255,255,0.65)';
const BUTTON_FILL = '#C7EEEF';
const BUTTON_FILL_ACTIVE = COLORS?.cyan || '#00FFFF';
const ICON_DEFAULT = '#33372F';
const ICON_ACTIVE = COLORS?.olive || '#808000';
const ICON_ACTIVE_BG = 'rgba(126,160,14,0.12)';
const ICON_ON_BUTTON = '#1C2420';

// ---- Helpers ----
function BrokenWalletIcon({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path d="M3 7.8C3 6.25441 4.25441 5 5.8 5H18.2C19.7456 5 21 6.25441 21 7.8V16.2C21 17.7456 19.7456 19 18.2 19H5.8C4.25441 19 3 17.7456 3 16.2V7.8Z" stroke={color} strokeWidth={1.6} />
      <Path d="M15.2 10.6H18.1C18.5971 10.6 19 11.0111 19 11.5176V12.4824C19 12.9889 18.5971 13.4 18.1 13.4H15.2" stroke={color} strokeWidth={1.6} />
      <Path d="M11.2 5L8.6 9.1L12.1 12L9 15.6L11.6 19" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function buildBarPath(w: number): string {
  const cx = w / 2;
  const half = 61; // BUMP_WIDTH / 2
  return `M0,48 Q0,20 28,20 L${cx-half},20 C${cx-27.5},20 ${cx-18.3},0 ${cx},0 C${cx+18.3},0 ${cx+27.5},20 ${cx+half},20 L${w-28},20 Q${w},20 ${w},48 L${w},72 Q${w},80 ${w-28},80 L28,80 Q0,80 0,72 Z`;
}
const BAR_PATH = buildBarPath(NAV_WIDTH);

export default function FloatingNav() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const currentTab = segments[segments.length - 1] || 'home';

  const [isMinimized, setIsMinimized] = useState(false);
  const isMinimizedRef = useRef(false);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const collapseAnim = useRef(new Animated.Value(0)).current; 

  useEffect(() => { isMinimizedRef.current = isMinimized; }, [isMinimized]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isMinimizedRef.current,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10,
      onPanResponderGrant: () => {
        // @ts-ignore
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        const dist = Math.sqrt(g.dx ** 2 + g.dy ** 2);
        if (!isMinimizedRef.current) {
          if (dist > 60) {
            setIsMinimized(true);
            Animated.spring(collapseAnim, { toValue: 1, useNativeDriver: false }).start();
            // Snap to edge logic
            // @ts-ignore
            const targetX = pan.x._value < (NAV_WIDTH/2) ? 0 : (NAV_WIDTH - MINI_SIZE);
            Animated.spring(pan.x, { toValue: targetX, useNativeDriver: false }).start();
          } else {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          }
        } else {
          if (dist < 15) {
            setIsMinimized(false);
            Animated.parallel([
              Animated.spring(collapseAnim, { toValue: 0, useNativeDriver: false }),
              Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }),
            ]).start();
          }
        }
      },
    })
  ).current;

  const barOpacity = collapseAnim.interpolate({ inputRange: [0, 0.2], outputRange: [1, 0], extrapolate: 'clamp' });
  const miniOpacity = collapseAnim.interpolate({ inputRange: [0.8, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <Animated.View
      style={[styles.wrapper, { bottom: insets.bottom + 15, transform: pan.getTranslateTransform() }]}
      {...panResponder.panHandlers}
    >
      {/* FULL BAR */}
      <Animated.View pointerEvents={isMinimized ? 'none' : 'box-none'} style={{ opacity: barOpacity, flex: 1 }}>
        <View style={styles.shadow} pointerEvents="none">
          <MaskedView style={styles.fullSize} maskElement={<Svg width={NAV_WIDTH} height={SVG_HEIGHT}><Path d={BAR_PATH} fill="#000" /></Svg>}>
            <BlurView intensity={55} tint="light" style={styles.fullSize} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TINT }]} />
          </MaskedView>
        </View>

        <Svg width={NAV_WIDTH} height={SVG_HEIGHT} style={styles.rim} pointerEvents="none">
          <Path d={BAR_PATH} fill="none" stroke={GLASS_RIM} strokeWidth={1.2} />
        </Svg>

        <View style={styles.iconRow} pointerEvents="box-none">
          {NAV_ITEMS.map((item) => {
            if (item.isCenter) return <View key={item.key} style={{ flex: 1 }} />;
            const active = currentTab === item.key;
            const iconColor = active ? ICON_ACTIVE : ICON_DEFAULT;
            const name = active ? item.activeIcon : item.icon;

            return (
              <TouchableOpacity key={item.key} onPress={() => router.push(`/${item.key}` as any)} style={styles.navItem}>
                <View style={[styles.bubble, active && styles.bubbleActive]}>
                  {name === 'broken-wallet' ? <BrokenWalletIcon color={iconColor} /> : <Ionicons name={name} size={23} color={iconColor} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={() => router.push('/scan' as any)} style={[styles.centerBtn, { backgroundColor: currentTab === 'scan' ? BUTTON_FILL_ACTIVE : BUTTON_FILL }]}>
          <Ionicons name={currentTab === 'scan' ? 'scan' : 'scan-outline'} size={27} color={ICON_ON_BUTTON} />
        </TouchableOpacity>
      </Animated.View>

      {/* MINIMIZED PILL */}
      <Animated.View pointerEvents={isMinimized ? 'auto' : 'none'} style={[styles.mini, { opacity: miniOpacity }]}>
        <Ionicons name="chevron-up" size={22} color={ICON_ON_BUTTON} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: H_MARGIN, right: H_MARGIN, height: WRAPPER_HEIGHT, zIndex: 9999 },
  fullSize: { width: NAV_WIDTH, height: SVG_HEIGHT },
  shadow: { position: 'absolute', top: BUTTON_POKE, left: 0, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 14, elevation: 8 },
  rim: { position: 'absolute', top: BUTTON_POKE, left: 0 },
  iconRow: { position: 'absolute', top: BUTTON_POKE + BUMP_HEIGHT, left: 0, right: 0, height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 15, zIndex: 10 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bubble: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  bubbleActive: { backgroundColor: ICON_ACTIVE_BG },
  centerBtn: { position: 'absolute', top: 0, left: (NAV_WIDTH - BUTTON_SIZE) / 2, width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 12, zIndex: 20 },
  mini: { position: 'absolute', top: BUTTON_POKE, left: (NAV_WIDTH - MINI_SIZE) / 2, width: MINI_SIZE, height: MINI_SIZE, borderRadius: MINI_SIZE / 2, backgroundColor: BUTTON_FILL, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 12 },
});