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
          <TouchableOpacity style={styles.iconActionBtn} onPress={() => setIsEditing(false)}>
            <Ionicons name="arrow-back" size={20} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.avatarEditContainer}>
            <TouchableOpacity onPress={pickAndUploadImage} style={styles.avatarWrapper} disabled={isUploadingImage}>
              {isUploadingImage ? (
                <ActivityIndicator color="#3AA39F" />
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.editAvatarImage} />
              ) : (
                <View style={styles.avatarPlaceholderFallback}>
                  <Text style={styles.avatarInitials}>{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</Text>
                </View>
              )}
              <View style={styles.avatarOverlayOverlay}>
                <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarSubtext}>Tap photo to update</Text>
          </View>

          <View style={styles.formCardContainer}>
            <View style={styles.modernInputBlock}>
              <Text style={styles.modernInputLabel}>Legal Name</Text>
              <TextInput 
                style={styles.modernTextInput} 
                value={fullName} 
                onChangeText={setFullName} 
                placeholder="Enter full name"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.modernInputBlock, styles.modernInputBlockDisabled]}>
              <Text style={styles.modernInputLabel}>Registered Email</Text>
              <TextInput 
                style={[styles.modernTextInput, styles.modernTextInputDisabled]} 
                value={email} 
                editable={false} 
              />
            </View>

            <TouchableOpacity 
              style={[styles.modernPrimaryActionBtn, isUpdating && styles.disabledButton]} 
              onPress={handleUpdateProfile} 
              disabled={isUpdating}
            >
              {isUpdating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modernPrimaryActionBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.modernHeader}>
        <TouchableOpacity style={styles.iconActionBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <TouchableOpacity style={styles.iconActionBtn} onPress={() => setIsEditing(true)}>
          <Ionicons name="options-outline" size={20} color="#1E293B" />
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
          {[
            { id: 'personal', label: 'Personal Details', description: 'Manage your primary account info', icon: 'person-outline', action: () => setIsEditing(true) },
            { id: 'password', label: 'Security & Password', description: 'Keep your login credentials secure', icon: 'shield-checkmark-outline', action: () => router.push('/profile/change-password' as any) },
            { id: 'appearance', label: 'Display & UI', description: 'Toggle dark mode and theme choices', icon: 'color-palette-outline', action: () => router.push('/profile/appearance' as any) },
          ].map((item) => (
            <TouchableOpacity key={item.id} style={styles.modernRowItem} onPress={item.action}>
              <View style={styles.modernRowLeft}>
                <View style={styles.iconWrapperSquare}>
                  <Ionicons name={item.icon as any} size={18} color="#475569" />
                </View>
                <View style={styles.rowTextColumn}>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                  <Text style={styles.rowSubLabel}>{item.description}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Data Ledger</Text>
          {[
            { id: 'archive', label: 'Data Vault Archive', description: 'Access hidden history loops', icon: 'archive-outline', action: () => router.push('/profile/archive' as any) },
            { id: 'export', label: 'Export Portfolio', description: 'Download complete statement CSVs', icon: 'cloud-download-outline', action: () => router.push('/profile/export' as any) },
          ].map((item) => (
            <TouchableOpacity key={item.id} style={styles.modernRowItem} onPress={item.action}>
              <View style={styles.modernRowLeft}>
                <View style={styles.iconWrapperSquare}>
                  <Ionicons name={item.icon as any} size={18} color="#475569" />
                </View>
                <View style={styles.rowTextColumn}>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                  <Text style={styles.rowSubLabel}>{item.description}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Support & Info</Text>
          {[
            { id: 'help', label: 'Help Desk', description: 'Get quick customer service fixes', icon: 'chatbubbles-outline', action: () => router.push('/profile/help' as any) },
            { id: 'terms', label: 'Terms of Use', description: 'Review legal terms & agreements', icon: 'document-attach-outline', action: () => router.push('/profile/terms' as any) },
            { id: 'about', label: 'App Version', description: 'Payton Mobile Edition v2.4.1', icon: 'information-circle-outline', action: () => router.push('/profile/about' as any) },
          ].map((item) => (
            <TouchableOpacity key={item.id} style={styles.modernRowItem} onPress={item.action}>
              <View style={styles.modernRowLeft}>
                <View style={styles.iconWrapperSquare}>
                  <Ionicons name={item.icon as any} size={18} color="#475569" />
                </View>
                <View style={styles.rowTextColumn}>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                  <Text style={styles.rowSubLabel}>{item.description}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ))}
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
    backgroundColor: '#FAFBFD',
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0
  },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 110 },
  
  modernHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60, marginTop: 4 },
  iconActionBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B', letterSpacing: -0.2 },

  modernHeroBlock: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  heroAvatar: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#E2E8F0' },
  heroAvatarPlaceholder: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderFallback: { width: '100%', height: '100%', backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '600', color: '#475569' },
  heroName: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginTop: 14, letterSpacing: -0.5 },
  
  badgeContainer: { backgroundColor: '#EBF6F5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#D1ECEB' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#3AA39F', letterSpacing: 0.5 },
  
  modernCardGroup: { paddingHorizontal: 20, marginTop: 24 },
  groupContextLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5, paddingLeft: 4 },
  modernRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 14, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  modernRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  iconWrapperSquare: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  rowTextColumn: { flex: 1 },
  rowPrimaryLabel: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  rowSubLabel: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '400' },

  avatarEditContainer: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 32, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' },
  editAvatarImage: { width: '100%', height: '100%' },
  avatarOverlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30, 41, 59, 0.3)', justifyContent: 'center', alignItems: 'center' },
  avatarSubtext: { fontSize: 13, color: '#64748B', marginTop: 10, fontWeight: '500' },
  
  formCardContainer: { paddingHorizontal: 20 },
  modernInputBlock: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 },
  modernInputBlockDisabled: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  modernInputLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 2, letterSpacing: 0.3 },
  modernTextInput: { fontSize: 15, color: '#1E293B', fontWeight: '500', height: 30, padding: 0 },
  modernTextInputDisabled: { color: '#64748B' },
  disabledButton: { backgroundColor: '#CBD5E1' },
  
  modernPrimaryActionBtn: { backgroundColor: '#3AA39F', height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  modernPrimaryActionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  
  modernLogoutBtn: { alignSelf: 'center', marginTop: 32, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  modernLogoutText: { color: '#EF4444', fontSize: 14, fontWeight: '600', letterSpacing: -0.1 }
});