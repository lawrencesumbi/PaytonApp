import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
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
  id: string; 
  sponsor_name: string;
  sponsor_email: string;
}

export default function InvitationsScreen() {
  const router = useRouter(); 
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // 1. Naghimo og state para sa realtime nga oras ug petsa
  const [currentDateTime, setCurrentDateTime] = useState('');

  // 2. Function para i-format ang petsa ug oras parehas sa imong gusto nga layout
  const formatRealTime = () => {
    const now = new Date();
    
    // Format sa Petsa: Monday, October 19, 2020
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    const formattedDate = now.toLocaleDateString('en-US', dateOptions);

    // Format sa Oras: 10:00 PM
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    const formattedTime = now.toLocaleTimeString('en-US', timeOptions);

    setCurrentDateTime(`${formattedDate} • ${formattedTime}`);
  };

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

    // 3. Paandaron ang clock in real-time inig mount sa screen
    formatRealTime(); // Tawgon dayon diretso para dili mag-blangko sa sugod
    const timer = setInterval(formatRealTime, 1000); // Mo-update matag segundo

    return () => clearInterval(timer); // Limpyohan ang timer inig biya sa screen
  }, []);

  const handleAccept = async (id: string, sponsorName: string) => {
    try {
      setActionLoading(true);
      const { error } = await supabase
        .from('sponsor_spenders')
        .update({ status: 'accepted' })
        .eq('id', id);

      if (error) throw error;
      
      Alert.alert("Success 🎉", `You have successfully accepted the invitation from ${sponsorName}.`);
      setInvitations(prev => prev.filter(item => item.id !== id));
    } catch (error: any) {
      Alert.alert("Error ❌", error.message || "An error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async (id: string) => {
    try {
      setActionLoading(true);
      const { error } = await supabase
        .from('sponsor_spenders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      Alert.alert("Declined", "You have turned down the connection invitation.");
      setInvitations(prev => prev.filter(item => item.id !== id));
    } catch (error: any) {
      Alert.alert("Error ❌", error.message || "An error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ImageBackground
    source={require("../../assets/images/cover-bg.png")}
    resizeMode="cover"
    style={styles.backgroundImage}
    >
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.contentContainer}>
        
        {/* Top Floating Navigation Section */}
        <View style={styles.navigationRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Clean Minimalist Header */}
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Notifications </Text>
          {/* 4. Gi-puli diri ang state sa dynamic date/time */}
          <Text style={styles.headerSubtitle}>{currentDateTime}</Text>
        </View>

        {/* Dynamic List Render Blocks */}
        {loading ? (
          <View style={styles.centerLoadingState}>
            <ActivityIndicator color="#63f1d9" size="small" />
          </View>
        ) : invitations.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="mail-open-outline" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyStateTitle}>All Caught Up</Text>
            <Text style={styles.emptyStateSubtext}>
              You don't have any pending link requests. New invitations from incoming sponsors will appear here instantly.
            </Text>
          </View>
        ) : (
          <FlatList
            data={invitations}
            keyExtractor={(item) => item.id}
            refreshing={loading}
            onRefresh={fetchInvitations}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.flatListBottomPadding}
            renderItem={({ item, index }) => {
              // Dynamic Premium Pastel Array to match the reference card system styling
              const premiumPastels = [
                { bg: '#d5edf3', accent: '#63d6f3', text: '#087996' }, 
                { bg: '#ECFDF5', accent: '#59f5c1', text: '#035c43' }, 
                { bg: '#FFF5F5', accent: '#abf566', text: '#254b05' }, 
                { bg: '#FFFBEB', accent: '#6bcffd', text: '#09445f' }, 
              ];
              const theme = premiumPastels[index % premiumPastels.length];

              return (
                <View style={[styles.premiumInviteCard, { backgroundColor: theme.bg }]}>
                  {/* Left Side Accent Border Bar Indicator */}
                  <View style={[styles.verticalAccentBar, { backgroundColor: theme.accent }]} />
                  
                  <View style={styles.cardContentWrapper}>
                    <View style={styles.textCluster}>
                      <Text style={[styles.tagCategoryLabel, { color: theme.text }]}>
                        Incoming Sponsor Connection
                      </Text>
                      <Text style={styles.mainSponsorName} numberOfLines={1}>
                        {item.sponsor_name}
                      </Text>
                      <Text style={styles.secondaryEmailSub} numberOfLines={1}>
                        {item.sponsor_email}
                      </Text>
                    </View>

                    {/* Interactive Functional Circle Triggers */}
                    <View style={styles.actionCircleWrapper}>
                      <TouchableOpacity 
                        style={[styles.circleButton, styles.declineCircle]}
                        onPress={() => handleDecline(item.id)}
                        disabled={actionLoading}
                      >
                        <Ionicons name="close" size={16} color="#64748B"/>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.circleButton, { backgroundColor: theme.accent }]}
                        onPress={() => handleAccept(item.id, item.sponsor_name)}
                        disabled={actionLoading}
                      >
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage:{
    flex:1,
  },
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    marginTop: 60,
    borderStartStartRadius: 25,
    borderEndStartRadius: 25,
    elevation: 20,

    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0
  },
  contentContainer: { flex: 1, paddingHorizontal: 24 },
  
  // Clean Navigation Layout
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f2f8ef',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 10,
  },

  // Premium Header Typography (Based on Image 1)
  headerSection: { marginTop: 28, marginBottom: 18 },
  headerContext: { fontSize: 13, fontWeight: '600', color: '#38BDF8', marginBottom: 6 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 6, fontWeight: '500' },

  centerLoadingState: { flex: 0.5, justifyContent: 'center', alignItems: 'center' },
  flatListBottomPadding: { paddingBottom: 40 },
  
  // Premium Layout System copied directly from Image 1 Structure
  premiumInviteCard: { 
    flexDirection: 'row',
    borderRadius: 18, 
    marginBottom: 16, 
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  verticalAccentBar: {
    width: 5,
    height: '100%',
  },
  cardContentWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  textCluster: { flex: 0.76 },
  tagCategoryLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  mainSponsorName: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  secondaryEmailSub: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
  
  // Target Action Circle Triggers
  actionCircleWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10 
  },
  circleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  declineCircle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  
  // Empty UI States
  emptyStateContainer: { flex: 0.6, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyIconCircle: { 
    width: 64, 
    height: 64, 
    borderRadius: 22, 
    backgroundColor: '#F8FAFC', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  emptyStateTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', textAlign: 'center' },
  emptyStateSubtext: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 20, fontWeight: '400' }
});