// app/profile/personal.tsx
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { colors } from '../(spenderTabs)/profile';
import { supabase } from '../../lib/supabase';

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setIsLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("No active user session found.");

      setEmail(user.email || '');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profile) {
        setFullName(profile.full_name || '');
        setAvatarUrl(profile.avatar_url || null);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
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
      router.back();
    } catch (error: any) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerLoading]}>
        <StatusBar style="light" />
        <ActivityIndicator size="small" color="#3AA39F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Personal Details</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
  },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
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
  avatarPlaceholderFallback: { width: '100%', height: '100%', backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '600', color: '#475569' },
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
  disabledButton: { backgroundColor: '#CBD5E1' }
});