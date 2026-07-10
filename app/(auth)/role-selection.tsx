 import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useRef } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import { supabase } from '../../lib/supabase';

type Role = 'Personal' | 'Spender' | 'Sponsor';

export default function RoleSelectionScreen() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Animation refs
  const buttonOpacity = useRef(new Animated.Value(0.5)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  const roles: { type: Role; description: string; icon: any }[] = [
    { type: 'Personal', description: 'Manage personal budgets, expenses, and calendar reminders.', icon: 'user' },
    { type: 'Spender', description: 'Log daily expenses and coordinate shared costs.', icon: 'credit-card' },
    { type: 'Sponsor', description: 'Allocate allowances and monitor expense logs in real-time.', icon: 'shield' },
  ];

  const handleSelect = (role: Role) => {
    setSelectedRole(role);
    
    // Animate button visibility
    Animated.timing(buttonOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    
    // Scale effect for the card
    Animated.sequence([
      Animated.timing(scaleValue, { toValue: 0.97, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleValue, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const handleFinalize = async () => {
    if (!selectedRole) return;
    setIsLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace('/(auth)/login');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: selectedRole })
        .eq('id', user.id);

      if (updateError) throw updateError;

      const routeMap: Record<Role, any> = {
        Personal: '/(personalTabs)/home',
        Spender: '/(spenderTabs)/home',
        Sponsor: '/(sponsorTabs)/home',
      };
      router.replace(routeMap[selectedRole]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to update profile.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Account Setup</Text>
          <Text style={styles.subtitle}>Select your primary role to configure your workspace.</Text>
        </View>

        <View style={styles.roleList}>
          {roles.map((role) => {
            const isSelected = selectedRole === role.type;
            return (
              <Animated.View key={role.type} style={{ transform: isSelected ? [{ scale: scaleValue }] : [] }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.roleCard, isSelected && styles.selectedCard]}
                  onPress={() => handleSelect(role.type)}
                >
                  <View style={[styles.iconBox, isSelected && styles.selectedIconBox]}>
                    <Feather name={role.icon} size={24} color={isSelected ? '#166534' : '#64748B'} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={[styles.roleName, isSelected && { color: '#166534' }]}>{role.type}</Text>
                    <Text style={styles.roleDesc}>{role.description}</Text>
                  </View>
                  {isSelected && <Feather name="check-circle" size={20} color="#166534" style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        <Animated.View style={{ opacity: buttonOpacity }}>
          <TouchableOpacity
            style={[styles.primaryButton, { opacity: selectedRole ? 1 : 0.5 }]}
            disabled={!selectedRole || isLoading}
            onPress={handleFinalize}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Continue Setup</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  innerContainer: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { marginBottom: 40 },
  title: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#64748B', lineHeight: 22 },
  roleList: { gap: 18 },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    padding: 20, borderRadius: 28, borderWidth: 2, borderColor: '#E2E8F0',
    
    shadowColor: '#1e293b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 4,
  },
  selectedCard: { 
    borderColor: '#166534', backgroundColor: '#FFFFFF',
    
    shadowColor: '#166534', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 15, elevation: 8,
  },
  iconBox: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  selectedIconBox: { backgroundColor: '#DCFCE7' },
  textContainer: { flex: 1 },
  roleName: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  roleDesc: { fontSize: 13, color: '#64748B', lineHeight: 18, paddingRight: 8 },
  primaryButton: { 
    backgroundColor: '#166534', height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 40,
    shadowColor: '#166534', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});