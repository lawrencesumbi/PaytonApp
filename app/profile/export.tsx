import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile';
import { supabase } from '../../lib/supabase';

export default function ExportScreen() {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [allowanceOptions, setAllowanceOptions] = useState<any[]>([]);
  const [selectedAllowanceId, setSelectedAllowanceId] = useState<string | null>(null);

  const [incomePeriods, setIncomePeriods] = useState<any[]>([]);
  const [selectedIncomeId, setSelectedIncomeId] = useState<string | null>(null);

  useEffect(() => {
    fetchUserRoleAndOptions();
  }, []);

  const fetchUserRoleAndOptions = async () => {
    try {
      setLoadingMeta(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No authenticated user found.");
      
      setUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const role = profileData?.role || 'Personal';
      setUserRole(role);

      if (role === 'Spender' || role === 'Sponsor') {
        const queryField = role === 'Spender' ? 'spender_id' : 'sponsor_id';
        const { data: allowancesData, error: allowancesError } = await supabase
          .from('allowances')
          .select('id, allowance_name, amount, start_date, end_date')
          .eq(queryField, user.id);

        if (!allowancesError && allowancesData) {
          // Sort allowances from latest to oldest based on start_date
          const sortedAllowances = allowancesData.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
          setAllowanceOptions(sortedAllowances);
          if (sortedAllowances.length > 0) setSelectedAllowanceId(sortedAllowances[0].id);
        }
      } else {
        const { data: incomeData, error: incomeError } = await supabase
          .from('income')
          .select('id, source_name, amount, start_date, end_date')
          .eq('user_id', user.id);

        if (!incomeError && incomeData) {
          // Sort income from latest to oldest based on start_date
          const sortedIncome = incomeData.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
          setIncomePeriods(sortedIncome);
          if (sortedIncome.length > 0) setSelectedIncomeId(sortedIncome[0].id);
        }
      }
    } catch (error: any) {
      console.error("Error fetching export metadata:", error.message);
      Alert.alert("Error", "Failed to load export options based on your role.");
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleExport = async () => {
    if (!userId) return;
    setIsExporting(true);

    try {
      let csvContent = "";
      let fileName = "statement_ledger.csv";

      if (userRole === 'Spender' || userRole === 'Sponsor') {
        if (!selectedAllowanceId) {
          Alert.alert("Selection Required", "Please select an allowance period to export.");
          setIsExporting(false);
          return;
        }

        const { data: expenses, error } = await supabase
          .from('expenses')
          .select('id, amount, description, spent_at')
          .eq('allowance_id', selectedAllowanceId);

        if (error) throw error;

        fileName = `allowance_statement_${selectedAllowanceId}.csv`;
        csvContent = "Expense ID,Amount,Description,Spent At\n";
        expenses?.forEach((item) => {
          csvContent += `"${item.id}","${item.amount}","${item.description || ''}","${item.spent_at}"\n`;
        });

      } else {
        if (!selectedIncomeId) {
          Alert.alert("Selection Required", "Please select an income period to export.");
          setIsExporting(false);
          return;
        }

        const { data: expenses, error } = await supabase
          .from('expenses')
          .select('id, amount, description, spent_at')
          .eq('income_id', selectedIncomeId);

        if (error) throw error;

        fileName = `personal_statement_${selectedIncomeId}.csv`;
        csvContent = "Expense ID,Amount,Description,Spent At\n";
        expenses?.forEach((item) => {
          csvContent += `"${item.id}","${item.amount}","${item.description || ''}","${item.spent_at}"\n`;
        });
      }

      const file = new File(Paths.cache, fileName);
      if (file.exists) {
        file.delete();
      }
      file.create();
      file.write(csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert("Success", `File generated successfully at: ${file.uri}`);
      }

    } catch (error: any) {
      console.error("Export error:", error.message);
      Alert.alert("Export Failed", error.message || "An error occurred while generating your report.");
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingMeta) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#173D45" />
        <Text style={{ marginTop: 12, color: '#64748B' }}>Loading export settings...</Text>
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
        <Text style={styles.headerTitleCentered}>Export Data</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download-outline" size={32} color="#173D45" />
          </View>
          <Text style={styles.cardTitle}>Data CSV Ledger</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>Role: {userRole}</Text>
          </View>

          {(userRole === 'Spender' || userRole === 'Sponsor') ? (
            <View style={styles.sectionContainer}>
              <Text style={styles.label}>Select Allowance Period</Text>
              {allowanceOptions.length === 0 ? (
                <Text style={styles.noDataText}>No allowance periods found.</Text>
              ) : (
                allowanceOptions.map((item) => {
                  const isSelected = selectedAllowanceId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.optionCard, isSelected && styles.selectedChip]}
                      onPress={() => setSelectedAllowanceId(item.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.optionContent}>
                        <Text style={[styles.optionTitle, isSelected && styles.selectedOptionText]}>
                          {item.allowance_name}
                        </Text>
                        <View style={[styles.amountBadge, isSelected && styles.selectedAmountBadge]}>
                          <Text style={[styles.amountText, isSelected && styles.selectedAmountText]}>
                            ₱{Number(item.amount).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Ionicons 
                        name={isSelected ? "checkbox" : "square-outline"} 
                        size={20} 
                        color={isSelected ? "#173D45" : "#CBD5E1"} 
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.sectionContainer}>
              <Text style={styles.label}>Select Income Period</Text>
              {incomePeriods.length === 0 ? (
                <Text style={styles.noDataText}>No income sources found.</Text>
              ) : (
                incomePeriods.map((item) => {
                  const isSelected = selectedIncomeId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.optionCard, isSelected && styles.selectedChip]}
                      onPress={() => setSelectedIncomeId(item.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.optionContent}>
                        <Text style={[styles.optionTitle, isSelected && styles.selectedOptionText]}>
                          {item.source_name}
                        </Text>
                        <View style={[styles.amountBadge, isSelected && styles.selectedAmountBadge]}>
                          <Text style={[styles.amountText, isSelected && styles.selectedAmountText]}>
                            ₱{Number(item.amount).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Ionicons 
                        name={isSelected ? "checkbox" : "square-outline"} 
                        size={20} 
                        color={isSelected ? "#173D45" : "#CBD5E1"} 
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          <TouchableOpacity 
            style={[styles.pillPrimaryActionBtn, isExporting && styles.disabledButton]} 
            onPress={handleExport}
            disabled={isExporting}
            activeOpacity={0.85}
          >
            {isExporting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.pillPrimaryActionBtnText}>GENERATE & DOWNLOAD CSV</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5fcfa' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors?.headerDark || '#173D45',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  content: { paddingHorizontal: 20, paddingVertical: 24 },
  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderRadius: 24, 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EBF6F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  roleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 20,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  sectionContainer: { width: '100%', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 10 },
  noDataText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginBottom: 12 },
  optionCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedChip: {
    backgroundColor: '#EBF6F5',
    borderColor: '#173D45',
  },
  optionContent: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: { fontSize: 15, fontWeight: '600', color: '#334155', marginBottom: 6 },
  selectedOptionText: { color: '#173D45' },
  amountBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectedAmountBadge: {
    backgroundColor: '#D1E8E4',
  },
  amountText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  selectedAmountText: { color: '#173D45' },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  pillPrimaryActionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  disabledButton: { backgroundColor: '#CBD5E1' }
});