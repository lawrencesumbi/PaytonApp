// app/(spenderTabs)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function SpenderLayout() {
  const router = useRouter();
  const pathname = usePathname();

  // I-check kung ang kasamtangan nga screen kay chat o scan ba
  const isChatScreen = pathname === '/chat' || pathname.includes('chat');
  const isScanScreen = pathname === '/scan' || pathname.includes('scan');
   const isAddExpenseScreen = pathname.includes('add-expense');  


  // Itago ang AI FAB ug ang tibuok Tab Bar kung naa sa chat OR scan screen
  const shouldHideAiButton = isChatScreen || isScanScreen;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#10B981',   // Modern Emerald Green matching Friends UI
          tabBarInactiveTintColor: '#94A3B8', // Slate clean gray
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginBottom: Platform.OS === 'ios' ? 0 : 8,
          },
          tabBarStyle: {
            // ----- KINI NGA LINYA ANG MAG-TAGO SA TABS -----
            display: shouldHideAiButton ? 'none' : 'flex', 
            
            backgroundColor: '#FFFFFF',
            height: Platform.OS === 'ios' ? 88 : 64, // Saktong gitas-on para sa safe device area
            paddingTop: 8,
            borderTopWidth: 1,
            borderColor: '#F1F5F9', // Solid clean line separator (dili karaan tan-awon)
            
            // Subtle standard shadow para dili flat kaayo ang transition gikan sa content
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 3, 
          },
        }}
      >
        {/* ----------------- MAKITA SA UBOS ----------------- */}
        <Tabs.Screen 
          name="home" 
          options={{ 
            title: 'Home', 
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
            ) 
          }} 
        />
        
        <Tabs.Screen 
          name="budget" 
          options={{ 
            title: 'Budgets', 
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
            ) 
          }} 
        />

        {/* FLOATING SCAN TAB */}
        <Tabs.Screen 
          name="scan" 
          options={{ 
            title: 'Scan', 
            tabBarLabelStyle: {
              // Gi-adjust ang label sa scan para dili matabunan sa floating button
              marginBottom: Platform.OS === 'ios' ? -5 : 4,
              fontSize: 11,
              fontWeight: '600',
            },
            tabBarIcon: ({ focused }) => (
              <View style={[styles.floatingButton, focused && styles.floatingButtonActive]}>
                <Ionicons 
                  name={focused ? "camera" : "camera-outline"} 
                  size={24} 
                  color="#FFFFFF" // Puti ang icon para nindot tan-awon sa green background
                />
              </View>
            ) 
          }} 
        />

        <Tabs.Screen 
          name="split" 
          options={{ 
            title: 'Split', 
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "share-social" : "share-social-outline"} size={22} color={color} />
            ) 
          }} 
        />

        <Tabs.Screen 
          name="profile" 
          options={{ 
            title: 'Profile', 
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
            ) 
          }} 
        />

        {/* ----------------- NAKATAGO (HIDDEN TABS) ----------------- */}
        <Tabs.Screen name="chat" options={{ href: null }} /> 
        <Tabs.Screen name="transaction" options={{ href: null }} />
        <Tabs.Screen name="reminders" options={{ href: null }} />
        <Tabs.Screen name="statistics" options={{ href: null }} />
        <Tabs.Screen name="friends" options={{ href: null }} />
        <Tabs.Screen name="invitations" options={{ href: null }} />
        <Tabs.Screen name="Budgetcategorydetails" options={{ href: null }} /> {/* ADD THIS */}
        <Tabs.Screen name="addExpense" options={{ href: null }} />
         <Tabs.Screen name="add-expense" options={{ href: null }} /> {/* ✅ ADD THIS LINE */}
      </Tabs>

      {/* ----------------- FLOATING AI COACH BUTTON (FAB) ----------------- */}
      {!shouldHideAiButton && (
        <TouchableOpacity 
          style={styles.floatingAiButton} 
          onPress={() => router.push('/chat')} 
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </>
  );
}

// Gidugang nga Styles para sa Floating Effect
const styles = StyleSheet.create({
  floatingButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#10B981', // Gi-match sa imong Emerald Green
    justifyContent: 'center',
    alignItems: 'center',
    top: -12, // Mao ni ang nagpalutaw niya pataas
    
    // Shadow para sa floating effect
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  floatingButtonActive: {
    backgroundColor: '#059669', // Medyo mas mongitngit gamay nga green kung gi-click/active
    transform: [{ scale: 1.05 }], // Mo dako gamay para responsive feel
  },
  floatingAiButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 105 : 90, 
    right: 20, 
    backgroundColor: '#005B60', 
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
});