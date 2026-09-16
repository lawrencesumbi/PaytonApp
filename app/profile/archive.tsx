import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'; // or regular react-native
import { colors } from '../(spenderTabs)/profile'; // Adjust import path if needed
import { supabase } from '../../lib/supabase'; // Adjust your supabase client path here

export default function ArchiveScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [inactiveItems, setInactiveItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchArchivedData();
  }, []);

  const fetchArchivedData = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      // Fetch user profile to check role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) return;
      setUserRole(profile.role);

      const today = new Date().toISOString().split('T')[0];

      if (profile.role === 'Personal') {
        // Fetch inactive income for Personal role (end_date < today)
        const { data: incomes, error } = await supabase
          .from('income')
          .select('*')
          .eq('user_id', user.id)
          .lt('end_date', today);

        if (!error) setInactiveItems(incomes || []);
      } else {
        // Fetch inactive allowances for Spender or Sponsor role (end_date < today)
        const { data: allowances, error } = await supabase
          .from('allowances')
          .select('*')
          .or(`spender_id.eq.${user.id},sponsor_id.eq.${user.id}`)
          .lt('end_date', today);

        if (!error) setInactiveItems(allowances || []);
      }
    } catch (err) {
      console.error('Error fetching archive:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = async (item: any) => {
    setSelectedItem(item);
    setLoadingExpenses(true);

    let query = supabase.from('expenses').select('*');

    // Check kung allowance ba o income ang gi-click
    if (item.allowance_name) {
      query = query.eq('allowance_id', item.id);
    } else if (item.source_name) {
      query = query.eq('income_id', item.id); // <-- Gamiton ang income_id para sa Personal role!
    }

    const { data, error } = await query;

    if (!error) {
      setExpenses(data || []);
    }
    setLoadingExpenses(false);
  };

  const handleBackToArchiveList = () => {
    setSelectedItem(null);
    setExpenses([]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity 
          onPress={selectedItem ? handleBackToArchiveList : () => router.back()} 
          style={styles.backBtnTouchable}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>
          {selectedItem ? (selectedItem.allowance_name || selectedItem.source_name) : 'Data Vault Archive'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#173D45" />
        </View>
      ) : selectedItem ? (
        // Detail View: Showing Expenses for the clicked Allowance
        <View style={styles.detailContainer}>
          <View style={styles.cardDetail}>
            <Text style={styles.cardAmount}>₱{selectedItem.amount}</Text>
            <Text style={styles.cardDates}>
              Valid: {selectedItem.start_date} to {selectedItem.end_date}
            </Text>
          </View>

          <Text style={styles.sectionHeader}>Associated Expenses</Text>
          
          {loadingExpenses ? (
            <ActivityIndicator size="small" color="#173D45" style={{ marginTop: 20 }} />
          ) : expenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Text style={styles.subTitle}>No expenses recorded under this allowance.</Text>
            </View>
          ) : (
            <FlatList
              data={expenses}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.expenseItem}>
                  <View>
                    <Text style={styles.expenseDesc}>{item.description || 'No Description'}</Text>
                    <Text style={styles.expenseDate}>{new Date(item.spent_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.expenseAmount}>-₱{item.amount}</Text>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: 30 }}
            />
          )}
        </View>
      ) : inactiveItems.length === 0 ? (
        // Empty State
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="archive-outline" size={40} color="#173D45" />
          </View>
          <Text style={styles.mainTitle}>Archive Empty</Text>
          <Text style={styles.subTitle}>You have no inactive allowances or income records at this moment.</Text>
        </View>
      ) : (
        // List of Inactive Allowances / Incomes
        <FlatList
          data={inactiveItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.archiveCard} onPress={() => handleSelectItem(item)}>
              <View>
                <Text style={styles.itemTitle}>{item.allowance_name || item.source_name}</Text>
                <Text style={styles.itemSubtitle}>
                  {item.start_date} → {item.end_date}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.itemAmount}>₱{item.amount}</Text>
                <Ionicons name="chevron-forward" size={16} color="#64748B" style={{ marginTop: 4 }} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
  },
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
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  centerContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40 
  },
  iconCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 24, 
    backgroundColor: '#EBF6F5', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  mainTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 8 
  },
  subTitle: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center', 
    lineHeight: 22 
  },
  listContainer: {
    padding: 20,
  },
  archiveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f766e',
  },
  detailContainer: {
    flex: 1,
    padding: 20,
  },
  cardDetail: {
    backgroundColor: '#173D45',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  cardDates: {
    fontSize: 13,
    color: '#94a3b8',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  emptyExpenses: {
    marginTop: 40,
    alignItems: 'center',
  },
  expenseItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expenseDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  expenseDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
  }
});