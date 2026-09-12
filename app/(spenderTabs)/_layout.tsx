import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";

type TabIconName = ComponentProps<typeof Ionicons>["name"];

type TabIconProps = {
  focused: boolean;
  color: string;
  activeIcon: TabIconName;
  inactiveIcon: TabIconName;
};

function TabIcon({
  focused,
  color,
  activeIcon,
  inactiveIcon,
}: TabIconProps) {
  return (
    <View style={styles.iconContainer}>
      <Ionicons
        name={focused ? activeIcon : inactiveIcon}
        size={21}
        color={focused ? "#ffffff" : color}
      />
    </View>
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
          tabBarActiveTintColor: "#ffffff",
          tabBarInactiveTintColor: "rgba(255, 255, 255, 0.6)",
          // Giallow ni ang pag-customize sa tibuok tab container para mawala ang press overlay effect
          tabBarItemStyle: styles.tabBarItem,
          tabBarStyle: [
            styles.tabBar,
            shouldHideAiButton ? { display: "none" as const } : null,
          ],
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
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
            title: "",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
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
            title: "",
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
                  size={25}
                  color="#FFFFFF"
                />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="split"
          options={{
            title: "",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
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
            title: "",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
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
        <Tabs.Screen name="transaction" options={{ href: null }} />
        <Tabs.Screen name="reminders" options={{ href: null }} />
        <Tabs.Screen name="statistics" options={{ href: null }} />
        <Tabs.Screen name="friends" options={{ href: null }} />
        <Tabs.Screen name="invitations" options={{ href: null }} />
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
    left: 12,
    right: 12,
    height: Platform.OS === "ios" ? 70 : 66,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 7 : 6,
    paddingHorizontal: 3,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    backgroundColor: "#1F4F59",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
    overflow: "visible",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  
  tabBarItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // Gitangtang ang default background highlight sa pag-press
    backgroundColor: "transparent",
  },

  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  
  scanLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: -1,
    marginBottom: Platform.OS === "ios" ? -2 : 0,
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
    backgroundColor: "rgb(255, 255, 255)",
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