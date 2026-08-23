// app/(spenderTabs)/invitations.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router'; // Gidugang para sa navigation
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface Invitation {
  id: string; // Row ID from 'sponsor_spenders' table
  sponsor_name: string;
  sponsor_email: string;
}

export default function InvitationsScreen() {
  const router = useRouter(); // Initialize ang router engine
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // 1. FETCH PENDING INVITATIONS FOR CURRENT SPENDER
  const fetchInvitations = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Query 'sponsor_spenders' where status is 'pending' and matches user id
      const { data, error } = await supabase
        .from('sponsor_spenders')
        .select(`
          id,
          status,
          sponsor_id,
          profiles!sponsor_id (
            full_name,
            email
          )
        `)
        .eq('spender_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;

      // Format data array for FlatList state management
      const formattedInvites = (data || []).map((item: any) => ({
        id: item.id,
        sponsor_name: item.profiles?.full_name || 'Unknown Sponsor',
        sponsor_email: item.profiles?.email || 'No Email Address'
      }));

      setInvitations(formattedInvites);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to fetch incoming invitations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  // 2. CONTROLLER TO ACCEPT AN INVITATION
  const handleAccept = async (id: string, sponsorName: string) => {
    try {
      setActionLoading(true);

      // Update structural status to 'accepted' in the database ledger
      const { error } = await supabase
        .from('sponsor_spenders')
        .update({ status: 'accepted' })
        .eq('id', id);

      if (error) throw error;
      
      Alert.alert("Success 🎉", `You have successfully accepted the invitation from ${sponsorName}. Your accounts are now linked!`);
      // Evict item from local state cache array
      setInvitations(prev => prev.filter(item => item.id !== id));
    } catch (error: any) {
      Alert.alert("Error ❌", error.message || "An error occurred while accepting the invitation.");
    } finally {
      setActionLoading(false);
    }
  };

  // 3. CONTROLLER TO DECLINE AN INVITATION
  const handleDecline = async (id: string) => {
    try {
      setActionLoading(true);

      // Remove linkage entity completely upon rejection profile choices
      const { error } = await supabase
        .from('sponsor_spenders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      Alert.alert("Declined", "You have turned down the connection invitation.");
      setInvitations(prev => prev.filter(item => item.id !== id));
    } catch (error: any) {
      Alert.alert("Error ❌", error.message || "An error occurred while declining the invitation.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.contentContainer}>
        
        {/* Back Button Container */}
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()} // Pwede sad router.push('/home') depende sa imong routing setup
        >
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>

        {/* Modern Clean Header Section */}
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Invitations</Text>
          <Text style={styles.headerSubtitle}>Review and manage incoming linkage requests from active Sponsors looking to fund your account.</Text>
        </View>

        {/* Dynamic List Rendering & Conditional Loader Contexts */}
        {loading ? (
          <View style={styles.centerLoadingState}>
            <ActivityIndicator color="#0E2417" size="small" />
          </View>
        ) : invitations.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="mail-open-outline" size={32} color="#64748B" />
            </View>
            <Text style={styles.emptyStateTitle}>All Caught Up</Text>
            <Text style={styles.emptyStateSubtext}>You don't have any pending link requests. New invitations from incoming sponsors will appear here instantly.</Text>
          </View>
        ) : (
          <FlatList
            data={invitations}
            keyExtractor={(item) => item.id}
            refreshing={loading}
            onRefresh={fetchInvitations}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.invitationCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.avatarIconBox}>
                    <Ionicons name="business-outline" size={20} color="#0E2417" />
                  </View>
                  <View style={styles.sponsorMetadata}>
                    <Text style={styles.sponsorNameText}>{item.sponsor_name}</Text>
                    <Text style={styles.sponsorEmailText}>{item.sponsor_email}</Text>
                  </View>
                </View>

                {/* Elegant Action Trigger Utilities */}
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity 
                    style={[styles.baseActionBtn, styles.declineActionBtn]} 
                    onPress={() => handleDecline(item.id)}
                    disabled={actionLoading}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.baseActionBtn, styles.acceptActionBtn]} 
                    onPress={() => handleAccept(item.id, item.sponsor_name)}
                    disabled={actionLoading}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            contentContainerStyle={styles.flatListBottomPadding}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FAFBFD', 
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 
  },
  contentContainer: { flex: 1, paddingHorizontal: 20 },
  
  // Gidugang nga style para sa Back Button
  backButton: {
    marginTop: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },

  // Header Formatting
  headerSection: { marginTop: 14, marginBottom: 24 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#1E293B', letterSpacing: -0.6 },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 6, lineHeight: 20, fontWeight: '400' },
  
  // Loading & Dynamic States
  centerLoadingState: { flex: 0.6, justifyContent: 'center', alignItems: 'center' },
  flatListBottomPadding: { paddingBottom: 110 },
  
  // Card List Architecture
  invitationCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 18, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  avatarIconBox: { 
    width: 44, 
    height: 44, 
    borderRadius: 14, 
    backgroundColor: '#F1F5F9', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  sponsorMetadata: { flex: 1 },
  sponsorNameText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  sponsorEmailText: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '400' },
  
  // Interactive Action Blocks
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  baseActionBtn: { 
    height: 40, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    minWidth: 95,
    paddingHorizontal: 16
  },
  acceptActionBtn: { backgroundColor: '#10B981' }, 
  acceptBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  declineActionBtn: { backgroundColor: '#F1F5F9' }, 
  declineBtnText: { color: '#64748B', fontWeight: '600', fontSize: 13 },
  
  // Empty UI States
  emptyStateContainer: { flex: 0.7, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyIconCircle: { 
    width: 72, 
    height: 72, 
    borderRadius: 24, 
    backgroundColor: '#FFFFFF', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9'
  },
  emptyStateTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B', textAlign: 'center' },
  emptyStateSubtext: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, paddingHorizontal: 20, lineHeight: 18, fontWeight: '400' }
});