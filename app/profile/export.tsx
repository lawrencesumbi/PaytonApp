import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system'; // <-- Updated modern imports
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
          setAllowanceOptions(allowancesData);
          if (allowancesData.length > 0) setSelectedAllowanceId(allowancesData[0].id);
        }
      } else {
        const { data: incomeData, error: incomeError } = await supabase
          .from('income')
          .select('id, source_name, amount, start_date, end_date')
          .eq('user_id', user.id);

        if (!incomeError && incomeData) {
          setIncomePeriods(incomeData);
          if (incomeData.length > 0) setSelectedIncomeId(incomeData[0].id);
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

      // Modern Expo File System API implementation
      const file = new File(Paths.cache, fileName);
      if (file.exists) {
        file.delete();
      }
      file.create();
      file.write(csvContent); // Writes data using the new modern API

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
        <Text style={styles.headerTitleCentered}>Export Portfolio</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download-outline" size={32} color="#173D45" />
          </View>
          <Text style={styles.cardTitle}>Statement CSV Ledger</Text>
          <Text style={styles.cardDesc}>
            Role detected: <Text style={{ fontWeight: '700', color: '#173D45' }}>{userRole}</Text>
          </Text>

          {(userRole === 'Spender' || userRole === 'Sponsor') ? (
            <View style={styles.sectionContainer}>
              <Text style={styles.label}>Select Allowance Period:</Text>
              {allowanceOptions.length === 0 ? (
                <Text style={styles.noDataText}>No allowance periods found.</Text>
              ) : (
                allowanceOptions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.optionChip,
                      selectedAllowanceId === item.id && styles.selectedChip
                    ]}
                    onPress={() => setSelectedAllowanceId(item.id)}
                  >
                    <Text style={[styles.optionText, selectedAllowanceId === item.id && styles.selectedOptionText]}>
                      {item.allowance_name} (₱{item.amount})
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : (
            <View style={styles.sectionContainer}>
              <Text style={styles.label}>Select Income Period:</Text>
              {incomePeriods.length === 0 ? (
                <Text style={styles.noDataText}>No income sources found.</Text>
              ) : (
                incomePeriods.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.optionChip,
                      selectedIncomeId === item.id && styles.selectedChip
                    ]}
                    onPress={() => setSelectedIncomeId(item.id)}
                  >
                    <Text style={[styles.optionText, selectedIncomeId === item.id && styles.selectedOptionText]}>
                      {item.source_name} (₱{item.amount})
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          <TouchableOpacity 
            style={[styles.pillPrimaryActionBtn, isExporting && styles.disabledButton]} 
            onPress={handleExport}
            disabled={isExporting}
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
  content: { paddingHorizontal: 24, paddingVertical: 24 },
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
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  cardDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 16 },
  sectionContainer: { width: '100%', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  noDataText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginBottom: 12 },
  optionChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  selectedChip: {
    backgroundColor: '#EBF6F5',
    borderColor: '#173D45',
  },
  optionText: { fontSize: 14, color: '#334155' },
  selectedOptionText: { fontWeight: '700', color: '#173D45' },
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