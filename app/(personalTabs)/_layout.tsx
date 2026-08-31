// app/(personalTabs)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function PersonalLayout() {
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
          tabBarActiveTintColor: '#1B494E',   // Gi-match sa Split Deep Teal Theme
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
            borderColor: '#F1F5F9', // Solid clean line separator
            
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
              marginBottom: Platform.OS === 'ios' ? -5 : 4,
              fontSize: 11,
              fontWeight: '600',
            },
            tabBarIcon: ({ focused }) => (
              <View style={[styles.floatingButton, focused && styles.floatingButtonActive]}>
                <Ionicons 
                  name={focused ? "scan" : "scan-outline"} 
                  size={24} 
                  color="#FFFFFF" 
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
        <Tabs.Screen name="Budgetcategorydetails" options={{ href: null }} />
        <Tabs.Screen name="addExpense" options={{ href: null }} />
        <Tabs.Screen name="add-expense" options={{ href: null }} />
        <Tabs.Screen name="income" options={{ href: null }} />
      </Tabs>

      {/* FLOATING PAYTON AI BUTTON */}
      {!shouldHideAiButton && (
        <TouchableOpacity 
          style={styles.floatingAiButton} 
          onPress={() => router.push('/chat')} 
          activeOpacity={0.8}
        >
          {/* I-replace lang ang path sa imong Payton Logo image file */}
          <Image 
            source={require('../../assets/images/logo-light1.png')} 
            style={styles.paytonLogo} 
            resizeMode="contain" 
          />
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1B494E', // Deep Teal matching theme
    justifyContent: 'center',
    alignItems: 'center',
    top: -20,
    
    shadowColor: '#1B494E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  floatingButtonActive: {
    backgroundColor: '#123236',
    transform: [{ scale: 1.05 }],
  },
  // CLEAN WHITE PAYTON AI BUTTON
  floatingAiButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 105 : 90, 
    right: 20, 
    backgroundColor: '#FFFFFF', // Clean White background
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    
    // Subtle Deep Teal Border para dili ma-blend/mamatay sa light background
    borderWidth: 1.5,
    borderColor: '#43e7a3',
    
    // Soft Elevation & Shadow
    shadowColor: '#1B494E',
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