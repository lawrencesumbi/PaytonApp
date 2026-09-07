// app/(sponsorTabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function SpenderProfileScreen() {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoadingProfile(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("No active user session found.");

      setEmail(user.email || '');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profile) {
        setFullName(profile.full_name || '');
        setRole(profile.role || 'Spender');
        setAvatarUrl(profile.avatar_url || null);
      }
    } catch (error: any) {
      Alert.alert("Profile Error", error.message);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const pickAndUploadImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Payton needs gallery access to upload a profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert("Error", "Could not process image data stream.");
        return;
      }

      setIsUploadingImage(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const filePath = `${user.id}/avatar.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(asset.base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setAvatarUrl(publicUrl);
      Alert.alert("Success", "Profile photo updated successfully!");

    } catch (error: any) {
      Alert.alert("Upload Failed", error.message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert("Validation Error", "Full Name cannot be blank.");
      return;
    }

    try {
      setIsUpdating(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert("Success", "Account information updated successfully!");
      setIsEditing(false);
    } catch (error: any) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to exit your session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            setIsLoggingOut(true);
            const { error } = await supabase.auth.signOut();
            setIsLoggingOut(false);

            if (error) {
              Alert.alert("Error", error.message);
            } else {
              router.replace('/');
            }
          }
        }
      ]
    );
  };

  if (isLoadingProfile) {
    return (
      <SafeAreaView style={[styles.container, styles.centerLoading]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#3AA39F" />
      </SafeAreaView>
    );
  }

  if (isEditing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.modernHeader}>
          <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.backBtnTouchable}>
            <Ionicons name="arrow-back" size={20} color="#173D45" />
          </TouchableOpacity>
          <Text style={styles.headerTitleCentered}>Edit Profile</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editScrollContent}>
          <View style={styles.avatarEditContainer}>
            <TouchableOpacity onPress={pickAndUploadImage} style={styles.avatarRing} disabled={isUploadingImage}>
              {isUploadingImage ? (
                <ActivityIndicator color="#3AA39F" />
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.editAvatarImage} />
              ) : (
                <View style={styles.avatarPlaceholderFallback}>
                  <Text style={styles.avatarInitials}>{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={pickAndUploadImage} style={styles.cameraBadge} disabled={isUploadingImage}>
              <Ionicons name="camera-outline" size={18} color="#173D45" />
            </TouchableOpacity>
          </View>

          <View style={styles.formCardContainer}>
            <View style={styles.pillInputBlock}>
              <Text style={styles.pillInputLabel}>Full Name</Text>
              <TextInput 
                style={styles.pillTextInput} 
                value={fullName} 
                onChangeText={setFullName} 
                placeholder="Enter full name"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.pillInputBlock}>
              <Text style={styles.pillInputLabel}>E-Mail</Text>
              <TextInput 
                style={[styles.pillTextInput, styles.pillTextInputDisabled]} 
                value={email} 
                editable={false} 
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.bottomBtnContainer}>
          <TouchableOpacity 
            style={[styles.pillPrimaryActionBtn, isUpdating && styles.disabledButton]} 
            onPress={handleUpdateProfile} 
            disabled={isUpdating}
          >
            {isUpdating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.pillPrimaryActionBtnText}>SAVE</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <TouchableOpacity style={styles.iconActionBtn} onPress={() => setIsEditing(true)}>
          <Ionicons name="options-outline" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.modernHeroBlock}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.heroAvatar} />
          ) : (
            <View style={styles.heroAvatarPlaceholder}>
              <Text style={styles.avatarInitials}>{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
          )}
          <Text style={styles.heroName}>{fullName || "User Account"}</Text>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{role ? role.toUpperCase() : "SPENDER"}</Text>
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Security & Preferences</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'personal', label: 'Personal Details', description: 'Manage your primary account info', icon: 'person-outline', action: () => setIsEditing(true) },
              { id: 'password', label: 'Security & Password', description: 'Keep your login credentials secure', icon: 'shield-checkmark-outline', action: () => router.push('/profile/change-password' as any) },
              { id: 'appearance', label: 'Display & UI', description: 'Toggle dark mode and theme choices', icon: 'color-palette-outline', action: () => router.push('/profile/appearance' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <View style={styles.rowTextColumn}>
                    <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                    <Text style={styles.rowSubLabel}>{item.description}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Data Ledger</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'archive', label: 'Data Vault Archive', description: 'Access hidden history loops', icon: 'archive-outline', action: () => router.push('/profile/archive' as any) },
              { id: 'export', label: 'Export Portfolio', description: 'Download complete statement CSVs', icon: 'cloud-download-outline', action: () => router.push('/profile/export' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <View style={styles.rowTextColumn}>
                    <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                    <Text style={styles.rowSubLabel}>{item.description}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Support & Info</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'help', label: 'Help Desk', description: 'Get quick customer service fixes', icon: 'chatbubbles-outline', action: () => router.push('/profile/help' as any) },
              { id: 'terms', label: 'Terms of Use', description: 'Review legal terms & agreements', icon: 'document-attach-outline', action: () => router.push('/profile/terms' as any) },
              { id: 'about', label: 'App Version', description: 'Payton Mobile Edition v2.4.1', icon: 'information-circle-outline', action: () => router.push('/profile/about' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <View style={styles.rowTextColumn}>
                    <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                    <Text style={styles.rowSubLabel}>{item.description}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.modernLogoutBtn} onPress={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={styles.modernLogoutText}>Log Out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0
  },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 110 },
  
  modernHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60, marginTop: 4 },
  backBtnTouchable: { width: 20 },
  iconActionBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#173D45', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B', letterSpacing: -0.2 },
  headerTitleCentered: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#1E293B', letterSpacing: -0.2 },

  modernHeroBlock: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  heroAvatar: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#E2E8F0' },
  heroAvatarPlaceholder: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderFallback: { width: '100%', height: '100%', backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '600', color: '#475569' },
  heroName: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginTop: 14, letterSpacing: -0.5 },
  
  badgeContainer: { backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 11, marginTop: 8, borderWidth: 1, borderColor: '#0E7C5A' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#0E7C5A', letterSpacing: 0.5 },
  
  modernCardGroup: { paddingHorizontal: 20, marginTop: 24 },
  groupContextLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5, paddingLeft: 4 },
  modernRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 14, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  modernRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  iconWrapperSquare: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', marginRight: 14},
  rowTextColumn: { flex: 1 },
  rowPrimaryLabel: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  rowSubLabel: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '400' },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    shadowColor: '#0F172A',
    overflow: 'hidden',
  },
  rowItemFlat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 3,
    borderBottomColor: '#F1F5F9',
  },
  editScrollContent: { paddingBottom: 24, flexGrow: 1 },
  avatarEditContainer: { alignItems: 'center', marginTop: 24, marginBottom: 40, position: 'relative' },
  avatarRing: { 
    width: 112, 
    height: 112, 
    borderRadius: 56, 
    backgroundColor: '#F1F5F9', 
    justifyContent: 'center', 
    alignItems: 'center', 
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#E2E8F0',
  },
  editAvatarImage: { width: '100%', height: '100%' },
  cameraBadge: {
    position: 'absolute',
    bottom: -1,
    right: '53%',
    marginRight: -60,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },

  formCardContainer: { paddingHorizontal: 24, gap: 28 },
  pillInputBlock: { gap: 8 },
  pillInputLabel: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  pillTextInput: {
    borderWidth: 1,
    borderColor: '#dbe0e6',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 15,
    backgroundColor: '#ffffff',
    fontWeight: '500',
  },
  pillTextInputDisabled: { 
    borderWidth: 1,
    borderColor: '#e6e7e9',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 15,
    backgroundColor: '#efeff0',
    color: '#727375',
    fontWeight: '500',
  },

  bottomBtnContainer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12 },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPrimaryActionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  disabledButton: { backgroundColor: '#CBD5E1' },
  
  modernLogoutBtn: { alignSelf: 'center', marginTop: 32, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  modernLogoutText: { color: '#EF4444', fontSize: 14, fontWeight: '600', letterSpacing: -0.1 }
});