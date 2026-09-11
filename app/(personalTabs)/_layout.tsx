import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs, usePathname, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

type TabIconName = ComponentProps<typeof Ionicons>["name"];

type AnimatedTabIconProps = {
  focused: boolean;
  color: string;
  activeIcon: TabIconName;
  inactiveIcon: TabIconName;
};

function AnimatedTabIcon({
  focused,
  color,
  activeIcon,
  inactiveIcon,
}: AnimatedTabIconProps) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.92)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1 : 0.92,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  return (
    <Animated.View
      style={[
        styles.iconPill,
        focused && styles.iconPillActive,
        { transform: [{ scale }] },
      ]}
    >
      <Ionicons
        name={focused ? activeIcon : inactiveIcon}
        size={21}
        color={focused ? "#1B494E" : color}
      />
    </Animated.View>
  );
}

export default function SpenderLayout() {
  const router = useRouter();
  const pathname = usePathname();

  
  const isScanScreen = pathname === "/scan" || pathname.includes("scan");
  const isInsightScreen = pathname === "/insight" || pathname.includes("insight");
  const shouldHideAiButton = isScanScreen || isInsightScreen;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#1B494E",
          tabBarInactiveTintColor: "#94A3B8",
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarItemStyle: styles.tabBarItem,
          tabBarBackground: () => (
            <BlurView
              tint="light"
              intensity={80}
              style={[StyleSheet.absoluteFill, styles.blurContainer]}
            />
          ),
          tabBarStyle: [
            styles.tabBar,
            shouldHideAiButton ? { display: "none" as const } : null,
          ],
          animation: "fade",
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }: any) => (
              <AnimatedTabIcon
                color={color}
                focused={focused}
                activeIcon="home"
                inactiveIcon="home-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="budget"
          options={{
            title: "Budgets",
            tabBarIcon: ({ color, focused }: any) => (
              <AnimatedTabIcon
                color={color}
                focused={focused}
                activeIcon="wallet"
                inactiveIcon="wallet-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="scan"
          options={{
            title: "Scan",
            tabBarLabelStyle: styles.scanLabel,
            tabBarIcon: ({ focused }: any) => (
              <View
                style={[
                  styles.floatingButton,
                  focused && styles.floatingButtonActive,
                ]}
              >
                <Ionicons
                  name={focused ? "scan" : "scan-outline"}
                  size={24}
                  color="#FFFFFF"
                />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="split"
          options={{
            title: "Split",
            tabBarIcon: ({ color, focused }: any) => (
              <AnimatedTabIcon
                color={color}
                focused={focused}
                activeIcon="share-social"
                inactiveIcon="share-social-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }: any) => (
              <AnimatedTabIcon
                color={color}
                focused={focused}
                activeIcon="person"
                inactiveIcon="person-outline"
              />
            ),
          }}
        />

        {/* Hidden routes */}
        <Tabs.Screen name="insight" options={{ href: null }} />
        <Tabs.Screen name="income" options={{ href: null }} />
        <Tabs.Screen name="transaction" options={{ href: null }} />
        <Tabs.Screen name="reminders" options={{ href: null }} />
        <Tabs.Screen name="statistics" options={{ href: null }} />
        <Tabs.Screen name="friends" options={{ href: null }} />
        <Tabs.Screen name="Budgetcategorydetails" options={{ href: null }} />
        
      </Tabs>

      {!shouldHideAiButton && (
        <TouchableOpacity
          style={styles.floatingAiButton}
          onPress={() => router.push("/insight")}
          activeOpacity={0.8}
        >
          <Image
            source={require("../../assets/images/logo-light1.png")}
            style={styles.paytonLogo}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: Platform.OS === "ios" ? 12 : 14,
    height: Platform.OS === "ios" ? 70 : 66,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 7 : 6,
    paddingHorizontal: 3,
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
    overflow: "visible", // Gi-allow ang floating items nga mogawas
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  blurContainer: {
    borderRadius: 36,
    overflow: "hidden", // Ang blur element ra ang gi-rounded capsule
  },
  tabBarItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
    overflow: "visible",
  },
  tabBarLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 1,
    marginBottom: Platform.OS === "ios" ? 0 : 1,
  },
  scanLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: -1,
    marginBottom: Platform.OS === "ios" ? -2 : 0,
  },
  iconPill: {
    width: 38,
    height: 30,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  iconPillActive: {
    backgroundColor: "rgba(67, 231, 163, 0.22)",
  },
  floatingButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1B494E",
    justifyContent: "center",
    alignItems: "center",
    top: -17,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.86)",
    shadowColor: "#1B494E",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 7,
  },
  floatingButtonActive: {
    backgroundColor: "#123236",
    transform: [{ scale: 1.06 }],
  },
  floatingAiButton: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 98 : 88,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    borderWidth: 1.5,
    borderColor: "#43E7A3",
    shadowColor: "#1B494E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 7,
  },
  paytonLogo: {
    width: 32,
    height: 32,
  },
});