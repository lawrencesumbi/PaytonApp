import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

export default function SponsorTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0F5143',
        tabBarInactiveTintColor: '#94A3B8',
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          borderTopWidth: 1,
          borderTopColor: '#F1F5F9',
          elevation: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="allowance"
        options={{
          title: 'Allowance',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
          ),
        }}
      />
      
      {/* Highlighted Center Tab */}
      <Tabs.Screen
        name="monitoring"
        options={{
          title: 'Monitoring',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
            marginTop: 4, // Adjust spacing due to elevated icon
          },
          tabBarIcon: ({ focused }) => (
            <View style={[styles.centerIcon, focused && styles.centerIconActive]}>
              <Ionicons 
                name={focused ? "eye" : "eye-outline"} 
                size={24} 
                color="#FFFFFF" 
              />
            </View>
          ),
        }}
      />
      
      <Tabs.Screen
        name="members"
        options={{
          title: 'Members',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerIcon: {
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: '#0F5143',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30, // Elevates icon above tab bar boundary
    elevation: 4,
    shadowColor: '#0F5143',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  centerIconActive: {
    backgroundColor: '#0B3C32',
    transform: [{ scale: 1.05 }],
  },
});