import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { useRouter, useSegments } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../constants/theme';

// ---- Configuration ----
interface NavItem {
  key: string;
  icon: any;
  activeIcon: any;
  label?: string;
  isCenter?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', icon: 'home-outline', activeIcon: 'home', label: 'Home' },
  { key: 'budget', icon: 'wallet-outline', activeIcon: 'wallet', label: 'Budget' },
  { key: 'scan', icon: 'scan-outline', activeIcon: 'scan', isCenter: true },
  { key: 'friends', icon: 'people-outline', activeIcon: 'people', label: 'Friends' },
  { key: 'profile', icon: 'person-outline', activeIcon: 'person', label: 'Profile' },
];

const { width: SCREEN_W } = Dimensions.get('window');
const H_MARGIN = 14;
const NAV_WIDTH = SCREEN_W - (H_MARGIN * 2);
const BAR_HEIGHT = 60;
const BUMP_HEIGHT = 22;
const BUMP_WIDTH = 130;
const CORNER_RADIUS = 28;
const BUTTON_SIZE = 64;
const SVG_HEIGHT = BAR_HEIGHT + BUMP_HEIGHT;
const BUTTON_SINK = 4;
const WRAPPER_HEIGHT = SVG_HEIGHT;
const MINI_SIZE = 56;

const GLASS_TINT = 'rgba(255,255,255,0.62)';
const GLASS_RIM = 'rgba(255,255,255,0.85)';
const BUTTON_FILL = '#C7EEEF';
const BUTTON_FILL_ACTIVE = COLORS?.cyan || '#00FFFF';
const ICON_DEFAULT = '#33372F';
const ICON_ACTIVE = COLORS?.olive || '#808000';
const ICON_ACTIVE_BG = 'rgba(126,160,14,0.12)';
const ICON_ON_BUTTON = '#1C2420';

function buildBarPath(w: number): string {
  const cx = w / 2;
  const half = BUMP_WIDTH / 2;
  const top = BUMP_HEIGHT;
  const bottom = BUMP_HEIGHT + BAR_HEIGHT;
  const r = CORNER_RADIUS;
  const peakFlat = 46;
  const peakL = cx - peakFlat / 2;
  const peakR = cx + peakFlat / 2;

  return `
    M0,${top + r}
    Q0,${top} ${r},${top}
    L${cx - half},${top}
    C${cx - half * 0.72},${top} ${peakL - 26},0 ${peakL},0
    L${peakR},0
    C${peakR + 26},0 ${cx + half * 0.72},${top} ${cx + half},${top}
    L${w - r},${top}
    Q${w},${top} ${w},${top + r}
    L${w},${bottom - r}
    Q${w},${bottom} ${w - r},${bottom}
    L${r},${bottom}
    Q0,${bottom} 0,${bottom - r}
    Z
  `;
}
const BAR_PATH = buildBarPath(NAV_WIDTH);

// Side-icon geometry — module-level since these only depend on NAV_WIDTH,
// which is already fixed at load time. (These must NOT be declared inside
// the component if `styles` below also needs to read them — a StyleSheet
// object is created once at module scope, so it can only close over other
// module-scope values, not component-local ones.)
const ITEM_W = 46;
const EDGE_PAD = 30;
const ITEM_GAP = NAV_WIDTH < 360 ? 8 : 15;
const ITEM_POS_1 = EDGE_PAD + ITEM_W / 2;
const ITEM_POS_2 = EDGE_PAD + ITEM_W + ITEM_GAP + ITEM_W / 2;
const ITEM_POS_3 = NAV_WIDTH - ITEM_POS_2;
const ITEM_POS_4 = NAV_WIDTH - ITEM_POS_1;

// TapAnim now accepts a `style` prop that is applied to ITS OWN wrapping
// Animated.View — this is what lets a caller absolutely-position the whole
// tappable item (via TapAnim's wrapper) while still animating just the
// scale on press. Previously the absolute-position styles were placed on
// the touchable *inside* TapAnim, whose real parent (an unstyled wrapper)
// has no defined size — so `top`/`bottom` percentages were being measured
// against a collapsed zero-height box instead of the icon row, which is
// what sent the icons flying off to unpredictable positions.
function TapAnim({
  children,
  style,
  activeScale = 0.82,
  bouncy = false,
}: {
  children: React.ReactNode;
  style?: any;
  activeScale?: number;
  bouncy?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: activeScale,
      useNativeDriver: true,
      stiffness: bouncy ? 600 : 500,
      damping: bouncy ? 10 : 22,
    }).start();
  }, [scale, activeScale, bouncy]);

  const pressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: bouncy ? 200 : 400,
      damping: bouncy ? 5 : 14,
    }).start();
  }, [scale, bouncy]);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            onPressIn: (e: any) => {
              pressIn();
              (child.props as any).onPressIn?.(e);
            },
            onPressOut: (e: any) => {
              pressOut();
              (child.props as any).onPressOut?.(e);
            },
            activeOpacity: 1,
          } as any);
        }
        return child;
      })}
    </Animated.View>
  );
}

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

  // ---- Side-icon horizontal positions ----
  const sideItems = NAV_ITEMS.filter(i => !i.isCenter);
  const buttonPositions = [ITEM_POS_1, ITEM_POS_2, ITEM_POS_3, ITEM_POS_4];

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
            // @ts-ignore
            const targetX = pan.x._value < (NAV_WIDTH / 2) ? 0 : (NAV_WIDTH - MINI_SIZE);
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
            <BlurView intensity={70} tint="light" style={styles.fullSize} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TINT }]} />
          </MaskedView>
        </View>

        <Svg width={NAV_WIDTH} height={SVG_HEIGHT} style={styles.rim} pointerEvents="none">
          <Path d={BAR_PATH} fill="none" stroke={GLASS_RIM} strokeWidth={1.2} />
        </Svg>

        <View style={styles.iconRow} pointerEvents="box-none">
          {sideItems.map((item, index) => {
            const active = currentTab === item.key;
            const iconColor = active ? ICON_ACTIVE : ICON_DEFAULT;
            const name = active ? item.activeIcon : item.icon;

            return (
              // The absolute positioning now lives on TapAnim's own wrapper
              // (a direct child of iconRow, which has a real, known height),
              // instead of on the TouchableOpacity buried inside it.
              <TapAnim
                key={item.key}
                activeScale={0.8}
                style={[styles.navItemAbsolute, { left: buttonPositions[index] }]}
              >
                <TouchableOpacity
                  onPress={() => router.push(`/${item.key}` as any)}
                  style={styles.navItemTouchable}
                >
                  <View style={[styles.bubble, active && styles.bubbleActive]}>
                    <Ionicons name={name} size={22} color={iconColor} />
                  </View>
                  {!!item.label && (
                    <Text
                      style={[styles.navLabel, active && styles.navLabelActive, { opacity: active ? 1 : 0 }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  )}
                </TouchableOpacity>
              </TapAnim>
            );
          })}
        </View>

        <TapAnim activeScale={0.78} bouncy style={styles.centerBtnWrapper}>
          <TouchableOpacity
            onPress={() => router.push('/scan' as any)}
            style={[
              styles.centerBtn,
              { backgroundColor: currentTab === 'scan' ? BUTTON_FILL_ACTIVE : BUTTON_FILL },
            ]}
          >
            <Ionicons name={currentTab === 'scan' ? 'scan' : 'scan-outline'} size={27} color={ICON_ON_BUTTON} />
          </TouchableOpacity>
        </TapAnim>
      </Animated.View>

      {/* MINIMIZED PILL */}
      <Animated.View pointerEvents={isMinimized ? 'auto' : 'none'} style={[styles.mini, { opacity: miniOpacity }]}>
        <TapAnim activeScale={0.85} bouncy style={styles.miniTapWrapper}>
          <TouchableOpacity
            onPress={() => {
              setIsMinimized(false);
              Animated.parallel([
                Animated.spring(collapseAnim, { toValue: 0, useNativeDriver: false }),
                Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }),
              ]).start();
            }}
            style={styles.miniInner}
          >
            <Ionicons name="chevron-up" size={22} color={ICON_ON_BUTTON} />
          </TouchableOpacity>
        </TapAnim>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: H_MARGIN, right: H_MARGIN, height: WRAPPER_HEIGHT, zIndex: 9999 },
  fullSize: { width: NAV_WIDTH, height: SVG_HEIGHT },
  shadow: { position: 'absolute', top: 0, left: 0, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 14, elevation: 8 },
  rim: { position: 'absolute', top: 0, left: 0 },
  iconRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  // Positioning ONLY — applied to TapAnim's own wrapper, a direct child of
  // iconRow. `top`/`height` are derived from the real bar constants (the
  // flat part of the bar spans exactly this band) instead of stale
  // hardcoded numbers, so this stays correct if the mountain's height ever
  // changes again.
  navItemAbsolute: {
    position: 'absolute',
    top: BUMP_HEIGHT,
    height: BAR_HEIGHT,
    width: ITEM_W,
    marginLeft: -ITEM_W / 2,
  },
  // Fills the positioned wrapper above and centers bubble+label inside it.
  navItemTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bubbleActive: { backgroundColor: ICON_ACTIVE_BG },
  navLabel: { fontSize: 10, fontWeight: '600', color: ICON_DEFAULT },
  navLabelActive: { color: ICON_ACTIVE, fontWeight: '700' },
  // Positioning for the center scan button's TapAnim wrapper.
  centerBtnWrapper: {
    position: 'absolute',
    top: BUTTON_SINK,
    left: (NAV_WIDTH - BUTTON_SIZE) / 2,
  },
  centerBtn: { width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 6, zIndex: 20 },
  mini: { position: 'absolute', top: BUTTON_SINK, left: (NAV_WIDTH - MINI_SIZE) / 2, width: MINI_SIZE, height: MINI_SIZE, zIndex: 30 },
  miniTapWrapper: { width: MINI_SIZE, height: MINI_SIZE },
  miniInner: { width: MINI_SIZE, height: MINI_SIZE, borderRadius: MINI_SIZE / 2, backgroundColor: BUTTON_FILL, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 12 },
});