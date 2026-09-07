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
        animation: 'fade',
        animationDuration: 220,
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Platform.OS === 'ios' ? 12 : 10,
          backgroundColor: 'rgba(255, 255, 255, 0.82)',
          height: Platform.OS === 'ios' ? 72 : 64,
          paddingTop: 7,
          paddingBottom: Platform.OS === 'ios' ? 7 : 6,
          paddingHorizontal: 7,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.96)',
          borderRadius: 38,
          elevation: 10,
          shadowColor: '#0F5143',
          shadowOffset: { width: 0, height: 7 },
          shadowOpacity: 0.14,
          shadowRadius: 18,
        },
        tabBarItemStyle: {
          borderRadius: 30,
          marginHorizontal: 2,
          marginVertical: 2,
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
          tabBarIcon: ({ color, focused }) => <CircularTabIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />,
        }}
      />
      
      <Tabs.Screen
        name="allowance"
        options={{
          title: 'Allowance',
          tabBarIcon: ({ color, focused }) => <CircularTabIcon name={focused ? 'wallet' : 'wallet-outline'} color={color} focused={focused} />,
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
                size={26} 
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
          tabBarIcon: ({ color, focused }) => <CircularTabIcon name={focused ? 'people' : 'people-outline'} color={color} focused={focused} />,
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <CircularTabIcon name={focused ? 'person' : 'person-outline'} color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function CircularTabIcon({ name, color, focused }: { name: any; color: string; focused: boolean }) {
  return (
    <View style={[styles.tabIconCircle, focused && styles.tabIconCircleActive]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconCircleActive: {
    backgroundColor: 'rgba(15, 81, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(15, 81, 67, 0.16)',
    shadowColor: '#0F5143',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 2,
  },
  centerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0F5143',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -32, // Elevates icon above tab bar boundary
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
    elevation: 4,
    shadowColor: '#0F5143',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  centerIconActive: {
    backgroundColor: '#0B3C32',
    transform: [{ scale: 1.04 }],
    shadowOpacity: 0.42,
  },
});
