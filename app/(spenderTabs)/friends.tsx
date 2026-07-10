// app/(spenderTabs)/friends.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface Friend {
  id: string;
  full_name: string;
  email: string;
}

export default function FriendsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Input Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Mode Trackers
  const [editingFriendId, setEditingFriendId] = useState<string | null>(null);

  // FETCH FRIENDS
  const fetchFriends = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('friends')
        .select('id, full_name, email')
        .eq('user_id', user.id)
        .order('full_name', { ascending: true });

      if (error) throw error;
      if (data) setFriends(data);
    } catch (error: any) {
      console.error('Error fetching friends:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // ADD OR UPDATE FRIEND (Unified Handler)
  const handleSaveFriend = async () => {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert('Missing Info', 'Please enter both a name and email.');
      return;
    }

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (editingFriendId) {
        // UPDATE MODE
        const { error } = await supabase
          .from('friends')
          .update({
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
          })
          .eq('id', editingFriendId)
          .eq('user_id', user.id); // Extra safety check

        if (error) throw error;
        Alert.alert('Updated 🎉', `${fullName} has been updated.`);
      } else {
        // INSERT MODE
        const { error } = await supabase
          .from('friends')
          .insert({
            user_id: user.id,
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
          });

        if (error) throw error;
        Alert.alert('Success 🎉', `${fullName} has been added to your friends list.`);
      }

      // Reset Form and State
      setFullName('');
      setEmail('');
      setEditingFriendId(null);
      Keyboard.dismiss();
      fetchFriends();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // START EDITING POPULATION
  const startEdit = (friend: Friend) => {
    setEditingFriendId(friend.id);
    setFullName(friend.full_name);
    setEmail(friend.email);
  };

  // CANCEL EDIT MODE
  const cancelEdit = () => {
    setEditingFriendId(null);
    setFullName('');
    setEmail('');
    Keyboard.dismiss();
  };

  // DELETE FRIEND
  const handleDeleteFriend = (friend: Friend) => {
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friends')
                .delete()
                .eq('id', friend.id);

              if (error) throw error;

              // Clear form if they deleted the one they were actively editing
              if (editingFriendId === friend.id) {
                cancelEdit();
              }

              fetchFriends();
            } catch (error: any) {
              Alert.alert('Delete Error', error.message);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchFriends();
  }, []);

  const filteredFriends = friends.filter((friend) => {
    const query = searchQuery.toLowerCase();
    return (
      friend.full_name.toLowerCase().includes(query) ||
      friend.email.toLowerCase().includes(query)
    );
  });

  const renderFriendItem = ({ item }: { item: Friend }) => (
    <View style={styles.friendCard}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>
          {item.full_name.substring(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName} numberOfLines={1}>{item.full_name}</Text>
        <Text style={styles.friendEmail} numberOfLines={1}>{item.email}</Text>
      </View>
      
      {/* Action Buttons Container */}
      <View style={styles.actionRow}>
        <TouchableOpacity onPress={() => startEdit(item)} style={styles.actionBtn} activeOpacity={0.6}>
          <Ionicons name="pencil-outline" size={18} color="#475569" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteFriend(item)} style={styles.actionBtn} activeOpacity={0.6}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity 
              style={styles.backBtn} 
              onPress={() => router.push('/split')}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Friends</Text>
          </View>
          <Text style={styles.headerSubtext}>Manage your split-expense squad.</Text>
        </View>

        <FlatList
          data={filteredFriends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriendItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* Form Container (Morphs depending on if you are adding or editing) */}
              <View style={[styles.formContainer, editingFriendId ? styles.formContainerEdit : null]}>
                <Text style={styles.sectionTitle}>
                  {editingFriendId ? '💡 Edit Friend Details' : 'Add New Friend'}
                </Text>
                
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput 
                    style={styles.input} 
                    placeholder="Full Name" 
                    placeholderTextColor="#94A3B8"
                    value={fullName}
                    onChangeText={setFullName}
                    editable={!submitting}
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput 
                    style={styles.input} 
                    placeholder="Email Address" 
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                    editable={!submitting}
                  />
                </View>

                {/* Form Buttons */}
                <View style={styles.formBtnGroup}>
                  {editingFriendId && (
                    <TouchableOpacity 
                      style={[styles.btnBase, styles.cancelBtn]} 
                      onPress={cancelEdit}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity 
                    style={[
                      styles.btnBase, 
                      editingFriendId ? styles.saveBtn : styles.addBtn,
                      editingFriendId ? { flex: 1 } : null
                    ]} 
                    onPress={handleSaveFriend}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons 
                          name={editingFriendId ? "checkmark-circle-outline" : "person-add-outline"} 
                          size={16} 
                          color="#FFFFFF" 
                        />
                        <Text style={styles.addBtnText}>
                          {editingFriendId ? 'Save Changes' : 'Add Friend'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 12 }]}>
                Your Network ({friends.length})
              </Text>

              {friends.length > 0 && (
                <View style={styles.searchWrapper}>
                  <Ionicons name="search-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or email..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            ) : (
              <View style={styles.centerBox}>
                <Ionicons name="people-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyText}>
                  {searchQuery ? "No network profiles match your search." : "You haven't added any friends yet."}
                </Text>
              </View>
            )
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  header: { 
    paddingHorizontal: 24, 
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 16 
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  backBtn: {
    padding: 6,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
  },
  headerTitle: { 
    fontSize: 32, 
    fontWeight: '800', 
    color: '#0F172A', 
    letterSpacing: -0.75,
    flex: 1,
  },
  headerSubtext: { 
    fontSize: 14, 
    color: '#64748B', 
    marginTop: 4, 
    fontWeight: '400',
    paddingLeft: 40,
  },
  formContainer: { 
    backgroundColor: '#FFFFFF', 
    padding: 20, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    shadowColor: '#0F172A', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.03, 
    shadowRadius: 12, 
    marginBottom: 12
  },
  formContainerEdit: {
    borderColor: 'rgb(59, 246, 131)', // Highlights form blue when editing
    backgroundColor: '#f0fff1',
  },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#0F172A', 
    marginBottom: 16, 
    letterSpacing: -0.3 
  },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F8FAFC', 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    marginBottom: 12 
  },
  searchWrapper: {
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF', 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    marginBottom: 16 
  },
  inputIcon: { 
    marginRight: 10 
  },
  input: { 
    flex: 1, 
    paddingVertical: 14, 
    fontSize: 15, 
    color: '#0F172A' 
  },
  searchInput: {
    flex: 1, 
    paddingVertical: 11, 
    fontSize: 14, 
    color: '#0F172A'
  },
  formBtnGroup: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    width: '100%',
  },
  btnBase: {
    padding: 14, 
    borderRadius: 12, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 8,
    flex: 1,
  },
  addBtn: { 
    backgroundColor: '#10B981', 
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  saveBtn: {
    backgroundColor: '#1bca4f',
    shadowColor: '#1d8d27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  cancelBtn: {
    backgroundColor: '#E2E8F0',
  },
  addBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '600' 
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600'
  },
  listContent: { 
    paddingHorizontal: 24,
    paddingBottom: 40 
  },
  friendCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF', 
    padding: 14, 
    borderRadius: 16, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: '#E2E8F0' 
  },
  avatarCircle: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#E6F4EA', 
    justifyContent: 'center', 
    alignItems: 'center'
  },
  avatarText: { 
    color: '#10B981', 
    fontSize: 14, 
    fontWeight: '700', 
    letterSpacing: 0.5 
  },
  friendInfo: { 
    flex: 1, 
    marginLeft: 14, 
    paddingRight: 8 
  },
  friendName: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#0F172A', 
    letterSpacing: -0.1 
  },
  friendEmail: { 
    fontSize: 13, 
    color: '#64748B', 
    marginTop: 1 
  },
  actionRow: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
  },
  centerBox: { 
    alignItems: 'center', 
    marginTop: 40, 
    gap: 12 
  },
  emptyText: { 
    color: '#94A3B8', 
    fontSize: 14, 
    fontWeight: '400',
    textAlign: 'center'
  }
});