// app/(spenderTabs)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/theme';

export default function SpenderLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const isChatScreen = pathname === '/chat' || pathname.includes('chat');
  const isScanScreen = pathname === '/scan' || pathname.includes('scan');
  const isAddExpenseScreen = pathname.includes('add-expense');

  const shouldHideAiButton = isChatScreen || isScanScreen;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.deepTeal,
          tabBarInactiveTintColor: COLORS.textMuted,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginBottom: Platform.OS === 'ios' ? 0 : 8,
          },
          tabBarStyle: {
            display: shouldHideAiButton ? 'none' : 'flex',
            backgroundColor: COLORS.card,
            height: Platform.OS === 'ios' ? 88 : 64,
            paddingTop: 8,
            borderTopWidth: 1,
            borderColor: COLORS.bg,
            shadowColor: COLORS.deepTeal,
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
            elevation: 3,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="budget"
          options={{
            title: 'Budgets',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan',
            tabBarLabelStyle: {
              marginBottom: Platform.OS === 'ios' ? -5 : 4,
              fontSize: 11,
              fontWeight: '600',
            },
            tabBarIcon: ({ focused }) => (
              <View style={[styles.floatingButton, focused && styles.floatingButtonActive]}>
                <Ionicons name={focused ? 'camera' : 'camera-outline'} size={24} color={COLORS.white} />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="split"
          options={{
            title: 'Split',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'share-social' : 'share-social-outline'} size={22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            ),
          }}
        />

        <Tabs.Screen name="chat" options={{ href: null }} />
        <Tabs.Screen name="transaction" options={{ href: null }} />
        <Tabs.Screen name="reminders" options={{ href: null }} />
        <Tabs.Screen name="statistics" options={{ href: null }} />
        <Tabs.Screen name="friends" options={{ href: null }} />
        <Tabs.Screen name="invitations" options={{ href: null }} />
        <Tabs.Screen name="Budgetcategorydetails" options={{ href: null }} />
        <Tabs.Screen name="addExpense" options={{ href: null }} />
        <Tabs.Screen name="add-expense" options={{ href: null }} />
      </Tabs>

      {!shouldHideAiButton && (
        <TouchableOpacity
          style={styles.floatingAiButton}
          onPress={() => router.push('/chat')}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses" size={26} color={COLORS.white} />
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.deepTeal,
    justifyContent: 'center',
    alignItems: 'center',
    top: -12,
    shadowColor: COLORS.deepTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  floatingButtonActive: {
    backgroundColor: COLORS.deepTealLight,
    transform: [{ scale: 1.05 }],
  },
  floatingAiButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 105 : 90,
    right: 20,
    backgroundColor: COLORS.deepTeal,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.deepTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 6,
  },
});