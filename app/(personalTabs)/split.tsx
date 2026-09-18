import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import 'expo-blob';
import * as FileSystem from 'expo-file-system/legacy'; // Siguraduha nga naay /legacy para walay deprecated error
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { categoryThemes, colors, styles } from '../../constants/split.style';

type Friend = {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
};

type ActiveSplitFriend = {
  id: string;
  split_expense_id: string;
  friend_id: string;
  owed_amount: number;
  status: 'unpaid' | 'paid';
  friends?: {
    id: string;
    full_name: string;
    avatar_url?: string; // I-apil kini diri
  };
};

type ActiveSplit = {
  id: string;
  description: string;
  total_amount: number;
  personal_share: number;
  split_type: 'EQUAL' | 'CUSTOM'; // Gitangtang ang '?' kay mandatory na siya gikan sa DB
  created_at: string;
  split_friends: ActiveSplitFriend[];
};

type BudgetOption = {
  id: string;
  name?: string;
  allocated_amount: number;
  income_id: string;
  categories?: {
    name: string;
  };
  income?: {
    id: string;
    start_date: string;
    end_date: string;
  };
  expenses?: { amount: number }[];
};

export default function SplitScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Default Array States
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeSplits, setActiveSplits] = useState<ActiveSplit[]>([]);
  const [availableBudgets, setAvailableBudgets] = useState<BudgetOption[]>([]);

  // Creation Form States
  const [formVisible, setFormVisible] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [splitType, setSplitType] = useState<'EQUAL' | 'CUSTOM'>('EQUAL');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customShares, setCustomShares] = useState<{ [key: string]: string }>({});

  // Friend Modal State
  const [addFriendModalVisible, setAddFriendModalVisible] = useState<boolean>(false);
  const [newFriendName, setNewFriendName] = useState<string>('');
  const [newFriendEmail, setNewFriendEmail] = useState<string>('');

  // Settlement Management Modal State
  const [settleModalVisible, setSettleModalVisible] = useState<boolean>(false);
  const [selectedSplitForSettle, setSelectedSplitForSettle] = useState<ActiveSplit | null>(null);

  // Settlement Payment Entry Modal State
  const [settleAmountModalVisible, setSettleAmountModalVisible] = useState<boolean>(false);
  const [selectedFriendToSettle, setSelectedFriendToSettle] = useState<ActiveSplitFriend | null>(null);
  const [paymentInputAmount, setPaymentInputAmount] = useState<string>('');

  // Budget Selection Modal State (For New Split creation only)
  const [budgetModalVisible, setBudgetModalVisible] = useState<boolean>(false);
  const [pendingSplitPayload, setPendingSplitPayload] = useState<any>(null);

  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);

  const [friendImageUri, setFriendImageUri] = useState<string | null>(null);

  const [editingSplit, setEditingSplit] = useState(null); // Para masubay kung naa ba tay gi-edit
  const [actionMenuVisible, setActionMenuVisible] = useState(false); // Para sa 3-dots menu kung kinahanglan
  const [selectedSplitForAction, setSelectedSplitForAction] = useState(null);

  const [myProfile, setMyProfile] = useState<{ full_name?: string; avatar_url?: string } | null>(null);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ visible: true, title, message });
  };

  useEffect(() => {
    fetchUserAndData();
  }, []);

  const fetchUserAndData = async () => {
    setLoading(true);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      await fetchData(currentUser.id);
    }
    setLoading(false);
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      await fetchData(currentUser.id);
    }
    setRefreshing(false);
  }, []);

  const calculateRemainingAmount = (budget: any): number => {
    const allocated = budget.allocated_amount || 0;
    const totalSpent = (budget.expenses || []).reduce(
      (sum: number, exp: { amount: number }) => sum + (exp.amount || 0),
      0
    );
    return allocated - totalSpent;
  };

  const fetchData = async (userId: string) => {
    // 1. Fetch Friends
    try {
      const { data: friendsData, error: friendsErr } = await supabase
        .from('friends')
        .select('id, full_name, email, avatar_url')
        .eq('user_id', userId)
        .order('full_name', { ascending: true });

      if (friendsErr) console.error('Friends fetch error:', friendsErr.message);
      setFriends(friendsData || []);
    } catch (err) {
      console.error('Friends error:', err);
      setFriends([]);
    }

    // 2. Fetch Active Splits
    try {
      const { data: splitsData, error: splitsErr } = await supabase
        .from('split_expenses')
        .select(`
          id,
          user_id,
          description,
          total_amount,
          personal_share,
          created_at,
          split_type,
          split_friends (
            id,
            split_expense_id,
            friend_id,
            owed_amount,
            status,
            friends (
              id,
              full_name,
              email,
              avatar_url
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (splitsErr) console.error('Splits fetch error:', splitsErr.message);
      setActiveSplits((splitsData as unknown as ActiveSplit[]) || []);
    } catch (err) {
      console.error('Splits error:', err);
      setActiveSplits([]);
    }

    // 3. Fetch Budgets
    try {
      const { data: budgetData, error: budgetErr } = await supabase
        .from('budgets')
        .select(`
          id,
          user_id,
          category_id,
          allocated_amount,
          income_id,
          categories ( name ),
          income ( id, start_date, end_date ),
          expenses ( amount )
        `)
        .eq('user_id', userId);

      if (budgetErr) console.error('Budgets fetch error:', budgetErr.message);

      if (budgetData) {
        const today = new Date().toISOString().split('T')[0];
        const activeBudgets = budgetData.filter((b: any) => {
          const income = Array.isArray(b.income) ? b.income[0] : b.income;
          if (!income) return true;
          return today >= income.start_date && today <= income.end_date;
        });

        setAvailableBudgets((activeBudgets as unknown as BudgetOption[]) || []);
      } else {
        setAvailableBudgets([]);
      }
    } catch (err) {
      console.error('Budgets error:', err);
      setAvailableBudgets([]);
    }

    // 4. Fetch User Profile (Para sa imong Avatar)
    try {
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userId)
        .single();

      if (profileErr) console.error('Profile fetch error:', profileErr.message);
      setMyProfile(profileData || null);
    } catch (err) {
      console.error('Profile error:', err);
      setMyProfile(null);
    }
  };

  

  const pickImage = async (useCamera: boolean = false) => {
    let permissionResult;
    
    if (useCamera) {
      permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (!permissionResult.granted) {
      showAlert('Permission Denied', 'Kinahanglan ang pahintulot para ma-access ang camera o gallery.');
      return;
    }

    let result = useCamera
      ? await ImagePicker.launchCameraAsync({ 
          mediaTypes: ['images'], 
          allowsEditing: true, 
          aspect: [1, 1], 
          quality: 0.5, // Giubos gamay ang quality para mas dali ma-process
          base64: false,
        })
      : await ImagePicker.launchImageLibraryAsync({ 
          mediaTypes: ['images'], 
          allowsEditing: true, 
          aspect: [1, 1], 
          quality: 0.5,
          base64: false,
        });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      // Siguruhon nato nga .jpg ang extension sa file nga i-upload para walay "unknown format"
      const uri = result.assets[0].uri;
      setFriendImageUri(uri);
    }
  };

  // Upload function padulong sa Supabase Storage
const uploadAvatarToSupabase = async (uri: string): Promise<string | null> => {
  try {
    if (!user) throw new Error('No user logged in');

    const fileName = `${Date.now()}.jpg`;
    const filePath = `${user.id}/${fileName}`;

    // 1. Basahon ang file gikan sa local uri isip base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 2. I-convert ang base64 ngadto sa raw binary array nga madawat sa Supabase
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 3. I-upload ang binary nga naay saktong contentType
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err: any) {
    console.error('Upload error:', err.message);
    return null;
  }
};

 const handleSaveFriend = async () => {
    // Gi-alisdan nato aron Full Name ra ang kinahanglanon (gi-remove ang && !newFriendEmail.trim())
    if (!newFriendName.trim() || !user) return;

    try {
      setLoading(true);
      let uploadedAvatarUrl = editingFriend?.avatar_url || null;

      // Kung naay bag-ong gipili nga imahe, i-upload sa Supabase
      if (friendImageUri && !friendImageUri.startsWith('http')) {
        uploadedAvatarUrl = await uploadAvatarToSupabase(friendImageUri);
      }

      const friendDataPayload = {
        user_id: user.id,
        full_name: newFriendName.trim(),
        // Kung naay gi-type sa email, i-lowercase; kung wala, mahimo siyang null
        email: newFriendEmail.trim() ? newFriendEmail.trim().toLowerCase() : null,
        avatar_url: uploadedAvatarUrl,
      };

      if (editingFriend) {
        const { data, error } = await supabase
          .from('friends')
          .update(friendDataPayload)
          .eq('id', editingFriend.id)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setFriends((prev) => (prev || []).map((f) => (f.id === editingFriend.id ? data : f)));
        }
      } else {
        const { data, error } = await supabase
          .from('friends')
          .insert([friendDataPayload])
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setFriends((prev) => [...(prev || []), data]);
        }
      }

      // Reset form states
      setEditingFriend(null);
      setNewFriendName('');
      setNewFriendEmail('');
      setFriendImageUri(null);
      setAddFriendModalVisible(false);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to save friend.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFriend = async (friendId: string) => {
    try {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', friendId);

      if (error) throw error;

      setFriends((prev) => prev.filter((f) => f.id !== friendId));
      showAlert('Success', 'Friend deleted successfully.');
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to delete friend.');
    }
  };

  const handleFriendPress = (friend: Friend) => {
    Alert.alert(
      "Manage Friend",
      `What would you like to do with ${friend.full_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Edit", 
          onPress: () => openEditModal(friend)
        },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: () => handleDeleteFriend(friend.id)
        }
      ]
    );
  };

  const openEditModal = (friend: Friend) => {
    setEditingFriend(friend);
    setNewFriendName(friend.full_name);
    setNewFriendEmail(friend.email || '');
    setFriendImageUri(friend.avatar_url || null);
    setAddFriendModalVisible(true);
  };

  const handleOpenAddModal = () => {
    setEditingFriend(null);
    setNewFriendName('');
    setNewFriendEmail('');
    setFriendImageUri(null);
    setAddFriendModalVisible(true);
  };

  const handleOpenEditSplit = (splitItem: any) => {
    setEditingSplit(splitItem);
    setDescription(splitItem.description || '');
    setAmount(splitItem.total_amount ? splitItem.total_amount.toString() : '');
    
    // Dire na niya basahon ang bag-ong column nga split_type
    setSplitType(splitItem.split_type || 'EQUAL');

    const friendIds = (splitItem.split_friends || []).map((sf: any) => sf.friend_id);
    setSelectedFriends(friendIds);

    let sharesObj: Record<string, string> = {};
    (splitItem.split_friends || []).forEach((sf: any) => {
      sharesObj[sf.friend_id] = sf.owed_amount.toString();
    });
    setCustomShares(sharesObj);

    setFormVisible(true);
  };

  const handleDeleteSplit = async (splitId: string) => {
    try {
      setLoading(true);
      // Tangtanga ang sakop sa split_friends una o i-delete ang split_expenses (depende sa foreign key cascade)
      const { error } = await supabase
        .from('split_expenses')
        .delete()
        .eq('id', splitId);

      if (error) throw error;

      // I-update ang local state aron mawala dayon sa UI
      setActiveSplits((prev) => prev.filter((s) => s.id !== splitId));
      showAlert('Success', 'Split expense deleted successfully.');
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to delete split.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectFriend = (friendId: string) => {
    if (selectedFriends.includes(friendId)) {
      setSelectedFriends((prev) => prev.filter((id) => id !== friendId));
      const updatedShares = { ...customShares };
      delete updatedShares[friendId];
      setCustomShares(updatedShares);
    } else {
      setSelectedFriends((prev) => [...prev, friendId]);
    }
  };

  const handleCustomShareChange = (friendId: string, val: string) => {
    setCustomShares((prev) => ({ ...prev, [friendId]: val }));
  };

  const handleInitiateCreateSplit = () => {
    const numericAmount = parseFloat(amount);
    if (!description.trim() || isNaN(numericAmount) || numericAmount <= 0) {
      showAlert('Invalid Input', 'Please enter a valid description and amount.');
      return;
    }

    if ((selectedFriends?.length || 0) === 0) {
      showAlert('Select Friends', 'Please select at least one friend to split with.');
      return;
    }

    let calculatedFriendsPayload: { friend_id: string; owed_amount: number }[] = [];
    let ownerShare = 0;

    if (splitType === 'EQUAL') {
      const totalParticipants = selectedFriends.length + 1;
      const share = parseFloat((numericAmount / totalParticipants).toFixed(2));
      ownerShare = share;
      calculatedFriendsPayload = selectedFriends.map((fId) => ({
        friend_id: fId,
        owed_amount: share,
      }));
    } else {
      let customSum = 0;
      for (const fId of selectedFriends) {
        const val = parseFloat(customShares[fId] || '0');
        if (isNaN(val) || val < 0) {
          showAlert('Invalid Share', 'Please enter valid custom amounts for selected friends.');
          return;
        }
        customSum += val;
        calculatedFriendsPayload.push({
          friend_id: fId,
          owed_amount: val,
        });
      }

      if (customSum > numericAmount) {
        showAlert('Math Error', 'The sum of friend shares cannot exceed total amount.');
        return;
      }
      ownerShare = parseFloat((numericAmount - customSum).toFixed(2));
    }

    setPendingSplitPayload({
      description: description.trim(),
      total_amount: numericAmount,
      personal_share: ownerShare,
      split_type: splitType,
      friends: calculatedFriendsPayload,
    });

    setFormVisible(false);
    setBudgetModalVisible(true);
  };

  const handleSelectBudgetAndCreateSplit = async (selectedBudgetId: string) => {
    if (!user || !pendingSplitPayload) return;
    setBudgetModalVisible(false);
    setLoading(true);

    try {
      const { data: budgetData, error: budgetErr } = await supabase
        .from('budgets')
        .select(`
          id, 
          allocated_amount, 
          income_id,
          expenses ( amount )
        `)
        .eq('id', selectedBudgetId)
        .single();

      if (budgetErr || !budgetData) {
        showAlert('Error', 'Could not verify budget status.');
        setLoading(false);
        return;
      }

      const remainingAmount = calculateRemainingAmount(budgetData);
      const splitAmount = pendingSplitPayload.total_amount;

      if (remainingAmount < splitAmount) {
        showAlert('Insufficient Budget', 'The selected budget category does not have enough balance. Try selecting a different budget or adjust the split amount.');
        setLoading(false);
        return;
      }

      const { error: expErr } = await supabase.from('expenses').insert([
        {
          budget_id: selectedBudgetId,
          amount: splitAmount,
          description: `[Split] ${pendingSplitPayload.description}`,
          spent_at: new Date().toISOString(),
          income_id: budgetData.income_id,
        },
      ]);

      if (expErr) throw expErr;

      const { data: splitExp, error: splitExpErr } = await supabase
        .from('split_expenses')
        .insert([
          {
            user_id: user.id,
            description: pendingSplitPayload.description,
            total_amount: splitAmount,
            personal_share: pendingSplitPayload.personal_share,
            created_at: new Date().toISOString(),
            split_type: pendingSplitPayload.split_type,
          },
        ])
        .select()
        .single();

      if (splitExpErr) throw splitExpErr;

      const friendInserts = (pendingSplitPayload.friends || []).map((f: any) => ({
        split_expense_id: splitExp.id,
        friend_id: f.friend_id,
        owed_amount: f.owed_amount,
        status: 'unpaid',
        updated_at: new Date().toISOString(),
      }));

      const { error: friendsErr } = await supabase.from('split_friends').insert(friendInserts);

      if (friendsErr) throw friendsErr;

      showAlert('Success', 'Split expense saved and deducted from budget!');
      setPendingSplitPayload(null);
      resetForm();
      fetchData(user.id);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to process split.');
    } finally {
      setLoading(false);
    }
  };

  // 1. Opens the Payment Input Modal when Mark Paid is clicked
  const handleInitiateSettleFriend = (friendShare: ActiveSplitFriend) => {
    setSelectedFriendToSettle(friendShare);
    setPaymentInputAmount(friendShare.owed_amount.toString());
    setSettleAmountModalVisible(true);
  };

  // 2. Confirms repayment, updates split_friends, and increments income amount
  const handleConfirmSettlePayment = async () => {
    if (!user || !selectedFriendToSettle) return;

    const paidVal = parseFloat(paymentInputAmount);
    if (isNaN(paidVal) || paidVal <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount paid.');
      return;
    }

    setSettleAmountModalVisible(false);
    setLoading(true);

    try {
      const friendName = selectedFriendToSettle.friends?.full_name || 'Friend';
      const currentOwed = selectedFriendToSettle.owed_amount || 0;
      const newOwed = Math.max(0, currentOwed - paidVal);
      const isFullyPaid = newOwed === 0;

      // Step A: Update friend's share in split_friends table
      const { error: updateFriendErr } = await supabase
        .from('split_friends')
        .update({
          owed_amount: parseFloat(newOwed.toFixed(2)),
          status: isFullyPaid ? 'paid' : 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedFriendToSettle.id);

      if (updateFriendErr) throw updateFriendErr;

      // Step B: Fetch active or fallback income using user_id
      // Step B: Fetch active or fallback income using user_id
      const today = new Date().toISOString().split('T')[0];
      let isUsingFallback = false; // Flag para mahibal-an nato kung nag-fallback ba

      let { data: activeIncomes, error: incomeErr } = await supabase
        .from('income')
        .select('id, amount, start_date, end_date')
        .eq('user_id', user.id)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('received_at', { ascending: false })
        .limit(1);

      if (incomeErr) {
        console.error('Income fetch error:', incomeErr.message);
      }

      // Fallback: If no income matches the exact current date, retrieve the latest income for this user
      if (!activeIncomes || activeIncomes.length === 0) {
        const { data: latestIncome, error: latestErr } = await supabase
          .from('income')
          .select('id, amount, start_date, end_date')
          .eq('user_id', user.id)
          .order('end_date', { ascending: false })
          .limit(1);

        if (latestErr) {
          console.error('Latest income fetch error:', latestErr.message);
        } else {
          activeIncomes = latestIncome;
          isUsingFallback = true; // Na-trigger ang fallback kay walay active karon
        }
      }

      if (activeIncomes && activeIncomes.length > 0) {
        const activeIncome = activeIncomes[0];
        const currentIncomeAmount = parseFloat(activeIncome.amount || 0);
        const updatedIncomeAmount = currentIncomeAmount + paidVal;

        const { error: incErr } = await supabase
          .from('income')
          .update({ amount: parseFloat(updatedIncomeAmount.toFixed(2)) })
          .eq('id', activeIncome.id);

        if (incErr) {
          console.error('Error updating income balance:', incErr.message);
          showAlert('Warning', `Payment recorded, but failed to update income: ${incErr.message}`);
        }
      } else {
        showAlert('Notice', 'Payment processed, but no income record was found to credit.');
      }

      // Gi-adjust ang Alert message aron ma-notify ang user kung nag-fallback ba
      let successMessage = `Successfully received ₱${paidVal.toFixed(2)} from ${friendName}. ${
        isFullyPaid ? 'Fully settled!' : `Remaining balance: ₱${newOwed.toFixed(2)}`
      }`;

      if (isUsingFallback) {
        successMessage += ` \n\n(Note: Added to your latest income because there is no active income set for today.)`;
      }

      showAlert('Payment Recorded', successMessage);

      // Update local state for immediate UI feedback
      if (selectedSplitForSettle) {
        setSelectedSplitForSettle((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            split_friends: prev.split_friends.map((sf) =>
              sf.id === selectedFriendToSettle.id
                ? {
                    ...sf,
                    owed_amount: parseFloat(newOwed.toFixed(2)),
                    status: isFullyPaid ? 'paid' : 'unpaid',
                  }
                : sf
            ),
          };
        });
      }

      fetchData(user.id);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to record payment.');
    } finally {
      setLoading(false);
      setSelectedFriendToSettle(null);
      setPaymentInputAmount('');
    }
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setSplitType('EQUAL');
    setSelectedFriends([]);
    setCustomShares({});
  };

  const calculateOwnerShare = () => {
    const total = parseFloat(amount) || 0;
    const friendCount = selectedFriends?.length || 0;
    if (splitType === 'EQUAL') {
      const parts = friendCount + 1;
      return (total / parts).toFixed(2);
    } else {
      let customSum = 0;
      (selectedFriends || []).forEach((id) => {
        customSum += parseFloat(customShares[id] || '0');
      });
      return Math.max(0, total - customSum).toFixed(2);
    }
  };

  // Shared avatar palette — same style family as categoryThemes used in the
  // budget picker below. Each entry is just { bg, text } since avatars only
  // show a flat circle + initial (no separate icon).
  const CARD_THEMES = [
    { bg: '#54C9CC', text: '#ffffff' },
    { bg: '#7EA00E', text: '#ffffff' },
    { bg: '#DCD964', text: '#213502' },
  ];
  const getAvatarTheme = (index: number) => CARD_THEMES[index % CARD_THEMES.length];

  const balanceSummary = (activeSplits || []).reduce(
    (totals, item) => {
      const outstandingFriendBalances = (item.split_friends || []).reduce(
        (sum, friendSplit) => sum + (friendSplit.owed_amount || 0),
        0
      );
      totals.youAreOwed += outstandingFriendBalances;
      totals.youOwe += Number(item.personal_share || 0);
      return totals;
    },
    { youOwe: 0, youAreOwed: 0 }
  );

  const handleSendReminderEmail = async (
  friendEmail: any, 
  friendName: any, 
  amount: any, 
  description: any
) => {

  console.log("CHECK VALUES:", { friendEmail, friendName, amount, description });
  try {
    // Optional: I-show ang loading state dinhi
    
    const { data, error } = await supabase.functions.invoke('send-payment-reminder', {
      body: { 
        friendEmail: friendEmail, // Nakuha gikan sa friends table
        friendName: friendName,   // Nakuha gikan sa friends table (full_name)
        amount: amount,           // Nakuha gikan sa split_friends (owed_amount)
        description: description  // Nakuha gikan sa split_expenses (description)
      },
    })

    if (error) throw error;

    Alert.alert("Malampuson!", `Naipadala na ang email reminder kang ${friendName}.`);
  } catch (error) {
    console.error("Error sending email:", error);
    Alert.alert("Wala nahayon", "May nahitabong sipyat sa pagpadala sa email reminder.");
  }
};

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.modernHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-circle-outline" size={28} color="#FFFFFF" />
          <Text style={styles.modernHeaderTitle}>Split Expenses</Text>
        </View>
        <TouchableOpacity
          style={styles.quickFormTrigger}
          onPress={() => setFormVisible(true)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.quickFormTriggerText}>New Split</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        > 

          <View style={styles.summaryPillsContainer}>
            {/* Who Owes You Pill */}
            <View style={[styles.summaryPill, styles.summaryPillOwed]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="cash-outline" size={16} color={colors.olive} />
                <Text style={styles.summaryPillLabel}>Who Owes You</Text>
              </View>
              <Text style={styles.summaryPillAmount}>₱{balanceSummary.youAreOwed.toFixed(2)}</Text>
            </View>

            {/* Your Share Pill */}
            <View style={[styles.summaryPill, styles.summaryPillOwe]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="pie-chart-outline" size={16} color={colors.positive} />
                <Text style={styles.summaryPillLabel}>Your Share</Text>
              </View>
              <Text style={styles.summaryPillAmount}>₱{balanceSummary.youOwe.toFixed(2)}</Text>
            </View>
          </View>

          {/* FRIENDS SECTION */}
          <View style={styles.friendsSection}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Friends List</Text>
              <Text style={styles.sectionCount}>{friends?.length || 0} friends</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalFriendsScroll}>
              <TouchableOpacity style={styles.avatarContainer} onPress={() => setAddFriendModalVisible(true)}>
                <View style={styles.addCircle}>
                  <Ionicons name="add" size={24} color={colors.textFaint} />
                </View>
                <Text style={styles.avatarName}>Add Friend</Text>
              </TouchableOpacity>

              {(friends || []).map((f) => {
            return (
              <TouchableOpacity 
                key={f.id} 
                style={styles.avatarContainer}
                onPress={() => handleFriendPress(f)}
              >
                <Image
                  source={
                    f.avatar_url
                      ? { uri: f.avatar_url }
                      : require('../../assets/images/default.png')
                  }
                  style={styles.friendAvatar}
                />
                <Text style={styles.avatarName} numberOfLines={1}>
                  {f.full_name}
                </Text>
              </TouchableOpacity>
            );
          })}
            </ScrollView>
          </View>

          {/* ACTIVE SPLITS HISTORY */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Split History</Text>
          </View>

          {(activeSplits?.length || 0) === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No splits recorded yet.</Text>
            </View>
          ) : (
            (activeSplits || []).map((item: any) => {
              const sfList = item.split_friends || [];
              const allPaid = sfList.length > 0 && sfList.every((sf: any) => sf.status === 'paid' && sf.owed_amount <= 0);

              return (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    
                    {/* 1. Category Icon sa Wala */}
          <View style={styles.categoryIconContainer}>
            <Ionicons 
              name={"people-outline"} 
              size={22} 
              color={colors.primary} 
            />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.historyDesc}>{item.description}</Text>
            <Text style={styles.historyMeta}>
              {item.created_at 
                ? new Date(item.created_at).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  }) 
                : ''}
            </Text>
          </View>

          <View style={styles.rightActionsContainer}>
            {allPaid && (

              <TouchableOpacity style={styles.fullySettledBadge}
                    onPress={() => {
                    setSelectedSplitForSettle(item);
                    setSettleModalVisible(true);
                  }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                <Text style={styles.fullySettledText}>Settled</Text>
              </TouchableOpacity>

            )}

            <View style={styles.iconButtonsRow}>
              {/* I-display lang ang Settle button kung WALA PA NA-SETTLE ang tanan */}
              {!allPaid && (

                <TouchableOpacity
                  style={styles.settleActionBtn}
                  onPress={() => {
                    setSelectedSplitForSettle(item);
                    setSettleModalVisible(true);
                  }}
                >
                  <Text style={styles.settleActionBtnText}>Settle</Text>
                </TouchableOpacity>

              )}

              {/* 3 Dots Button para sa Edit ug Delete options */}
              <TouchableOpacity
                style={styles.actionIconButton}
                onPress={() => {
                  setSelectedSplitForAction(item);
                  Alert.alert(
                    item.description || 'Split Options',
                    "Choose an action:",
                    [
                      { 
                        text: "Cancel", 
                        style: "cancel" 
                      },
                      {
                        text: "Edit",
                        onPress: () => handleOpenEditSplit(item),
                      },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => handleDeleteSplit(item.id),
                      },
                      
                    ]
                  );
                }}
              >
                <Ionicons name="ellipsis-vertical" size={18} color={'#555'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  })
)}
        </ScrollView>
      )}

      {/* CREATE SPLIT — floating centered card */}
      <Modal visible={formVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.formDrawerContainer}>
            <View style={styles.pullBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.drawerTitle}>
                {editingSplit ? "Edit Split Expense" : "Create Split Expense"}
              </Text>
              <TouchableOpacity 
                style={styles.closeCircle} 
                onPress={() => {
                  setFormVisible(false);
                  setDescription('');
                  setAmount('');
                  setSelectedFriends([]);
                  setCustomShares({});
                  setEditingSplit(null);
                }}
              >
                <Ionicons name="close" size={23} color={colors.headerDarker} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dinner with Friends"
                placeholderTextColor={colors.textFaint}
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.label}>Total Amount (₱)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={styles.label}>Split Method</Text>
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabBtn, splitType === 'EQUAL' && styles.tabBtnActive]}
                  onPress={() => setSplitType('EQUAL')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'EQUAL' && styles.tabBtnTextActive]}>Equal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, splitType === 'CUSTOM' && styles.tabBtnActive]}
                  onPress={() => setSplitType('CUSTOM')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'CUSTOM' && styles.tabBtnTextActive]}>Custom</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Select Friends Included</Text>
              {(friends?.length || 0) === 0 ? (
                <Text style={styles.emptyInlineText}>No friends added yet. Please add a friend first.</Text>
              ) : (
                <View style={styles.inlineChecklist}>
                  {(friends || []).map((f) => {
                    const isSelected = selectedFriends.includes(f.id);
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.checkChip, isSelected && styles.checkChipSelected]}
                        onPress={() => toggleSelectFriend(f.id)}
                      >
                        <Ionicons
                           name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={isSelected ? colors.primary : colors.textMuted}
                        />
                        <Text style={[styles.checkChipText, isSelected && styles.checkChipTextSelected]}>
                          {f.full_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {splitType === 'CUSTOM' && (selectedFriends?.length || 0) > 0 && (
                <View style={styles.customSection}>
                  <Text style={styles.customSectionTitle}>Enter Friend Shares (₱)</Text>
                  {selectedFriends.map((fId) => {
                    const friendObj = (friends || []).find((f) => f.id === fId);
                    return (
                      <View key={fId} style={styles.customRow}>
                        <Text style={styles.customMemberName}>{friendObj?.full_name || 'Friend'}</Text>
                        <TextInput
                          style={styles.customInput}
                          placeholder="0.00"
                          placeholderTextColor={colors.textFaint}
                          keyboardType="numeric"
                          value={customShares[fId] || ''}
                          onChangeText={(val) => handleCustomShareChange(fId, val)}
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              {amount !== '' && (selectedFriends?.length || 0) > 0 && (
                <View style={styles.previewBanner}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.positive} />
                  <Text style={styles.previewText}>
                    Your Personal Share: <Text style={{ fontWeight: '800' }}>₱{calculateOwnerShare()}</Text>
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.submitBtn} onPress={handleInitiateCreateSplit}>
                <Text style={styles.submitBtnText}>
                  {editingSplit ? "Update Split" : "Confirm & Process Split"}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SELECT BUDGET MODAL (FOR CREATION ONLY) — themed rows, matching Home's Quick Budget cards */}
      <Modal visible={budgetModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Budget Category</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setBudgetModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.headerDarker} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Select category to deduct the total expense:</Text>

            {(availableBudgets?.length || 0) === 0 ? (
              <Text style={styles.emptyText}>No active budget categories available.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {(availableBudgets || []).map((b, index) => {
                  const remaining = calculateRemainingAmount(b);
                  const theme = categoryThemes[index % categoryThemes.length];
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.budgetChipOption, { backgroundColor: theme.bg }]}
                      onPress={() => handleSelectBudgetAndCreateSplit(b.id)}
                    >
                      <View style={[styles.budgetIconCircle, { backgroundColor: theme.iconBg }]}>
                        <Ionicons name="folder-outline" size={18} color={theme.iconColor} />
                      </View>
                      <View style={styles.budgetTextGroup}>
                        <Text style={[styles.budgetName, { color: theme.text }]}>
                          {b.categories?.name || b.name || 'Budget Category'}
                        </Text>
                        <Text style={[styles.budgetBalance, { color: theme.text }]}>
                          Remaining: ₱{remaining.toFixed(2)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.text} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ADD / EDIT FRIEND MODAL */}
      <Modal visible={addFriendModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingFriend ? "Edit Friend" : "Add New Friend"}
              </Text>
              <TouchableOpacity 
                style={styles.closeCircle} 
                onPress={() => {
                  setAddFriendModalVisible(false);
                  setEditingFriend(null);
                  setNewFriendName('');
                  setNewFriendEmail('');
                  setFriendImageUri(null);
                }}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Friend's Full Name"
              placeholderTextColor={colors.textFaint}
              value={newFriendName}
              onChangeText={setNewFriendName}
            />

            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Friend's Email"
              placeholderTextColor={colors.textFaint}
              value={newFriendEmail}
              onChangeText={setNewFriendEmail}
            />

            {/* Preview ug Avatar Picker Buttons */}
            <View style={{ alignItems: 'center', marginVertical: 10 }}>
              <Image
                source={
                  friendImageUri
                    ? { uri: friendImageUri }
                    : require('../../assets/images/default.png')
                }
                style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 10 }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => pickImage(false)} style={{ padding: 6, backgroundColor: '#eee', borderRadius: 5 }}>
                  <Text>Pick from Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => pickImage(true)} style={{ padding: 6, backgroundColor: '#eee', borderRadius: 5 }}>
                  <Text>Take Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleSaveFriend}>
              <Text style={styles.submitBtnText}>
                {editingFriend ? "Update Friend" : "Save Friend"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MANAGE SHARES & SETTLEMENT MODAL — floating centered card */}
<Modal visible={settleModalVisible} animationType="fade" transparent>
  <View style={styles.modalOverlay}>
    <View style={[styles.modalContainer, { width: '92%', maxHeight: '85%' }]}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Settlement Details</Text>
        <TouchableOpacity style={styles.closeCircle} onPress={() => setSettleModalVisible(false)}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.modalSub}>Track paid shares and manage settlement:</Text>

      <FlatList
        data={selectedSplitForSettle ? [selectedSplitForSettle] : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const totalAmount = item.total_amount || 0;
          const personalShare = item.personal_share || 0;
          const friendsList = item.split_friends || [];

          return (
            <View style={{ gap: 12, paddingBottom: 16 }}>
              {/* Main Summary Info Card */}
              <View style={styles.settleMainCard}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.settleCardDesc}>{item.description}</Text>
                  <Text style={styles.settleCardDate}>
                    {item.created_at 
                      ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
                      : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.settleCardTotalLabel}>Total Amount</Text>
                  <Text style={styles.settleCardTotalValue}>₱{totalAmount.toFixed(2)}</Text>
                </View>
              </View>

              <Text style={[styles.modalSub, { marginTop: 8, marginBottom: 4 }]}>Involved Members & Shares:</Text>

              {/* Personal Share Row (You) */}
              <View style={styles.settleMemberRowCard}>
                <View style={styles.settleLeftCol}>
                  <Image
                    source={
                      myProfile?.avatar_url
                        ? { uri: myProfile.avatar_url }
                        : require('../../assets/images/default.png')
                    }
                    style={styles.settleAvatarImage}
                  />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.settleMemberName}>Me</Text>
                    <Text style={styles.settleMemberSub}>My Share</Text>
                  </View>
                </View>

                <View style={styles.settleCenterCol}>
                  <Text style={styles.settleAmountText}>₱{personalShare.toFixed(2)}</Text>
                </View>

                <View style={styles.settleRightCol}>
                  <View style={styles.settleOwnerBadge}>
                    <Text style={styles.settleOwnerBadgeText}>Owner</Text>
                  </View>
                </View>
              </View>

{/* Friends Involved List */}
{friendsList.map((sf: any) => {
  const isPaid = sf.status === 'paid' && sf.owed_amount <= 0;
  const friendName = sf.friends?.full_name || 'Friend';
  const avatarUrl = sf.friends?.avatar_url;

  return (
    <View key={sf.id} style={styles.settleMemberRowCard}>
      {/* Left: Friend Info */}
      <View style={styles.settleLeftCol}>
        <Image
          source={
            avatarUrl
              ? { uri: avatarUrl }
              : require('../../assets/images/default.png')
          }
          style={styles.settleAvatarImage}
        />
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.settleMemberName} numberOfLines={1}>{friendName}</Text>
          <Text style={styles.settleMemberSub}>
            {isPaid ? 'Settled' : 'Owes you'}
          </Text>
        </View>
      </View>

      {/* Center: Amount */}
      <View style={styles.settleCenterCol}>
        <Text style={styles.settleAmountText}>₱{(sf.owed_amount || 0).toFixed(2)}</Text>
      </View>

      {/* Right Column: Dynamic alignment based on isPaid */}
      <View style={[
        styles.settleRightCol, 
        { 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 6, 
          justifyContent: isPaid ? 'flex-end' : 'flex-start' // Kung paid, iduot sa pinaka-tuo para walay space
        }
    ]}>
        {isPaid ? (
          <View style={styles.settlePaidPill}>
            <Ionicons name="checkmark-circle" size={14} color={colors.positive} />
            <Text style={styles.settlePaidPillText}>Paid</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.settlePayButton}
              onPress={() => handleInitiateSettleFriend(sf)}
            >
              <Text style={styles.settlePayButtonText}>Pay</Text>
            </TouchableOpacity>

            {/* Notification Icon Button - Makita ra kung wala pa naka-pay */}
            <TouchableOpacity 
                onPress={() => handleSendReminderEmail(
  sf.friends?.email,             // Email gikan sa joined friends table
  sf.friends?.full_name,         // Pangalan gikan sa joined friends table
  sf.owed_amount,                // Kantidad sa utang gikan sa split_friends
  item?.description              // O kung unsa man ang variable name sa description sa gasto
)}
              >
              <Ionicons name="notifications-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
})}
            </View>
          );
        }}
      />
    </View>
  </View>
</Modal>

      {/* PAYMENT ENTRY INPUT MODAL FOR MARK PAID */}
<Modal visible={settleAmountModalVisible} animationType="fade" transparent>
  <View style={styles.modalOverlayCenter}>
    <View style={styles.paymentModalContainer}>
      
      {/* Header */}
      <View style={styles.paymentModalHeader}>
        <View style={styles.paymentModalTitleRow}>
          <View style={styles.paymentIconContainer}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.paymentModalMainTitle}>Record Payment</Text>
        </View>
        <TouchableOpacity
          style={styles.closeCircle}
          onPress={() => setSettleAmountModalVisible(false)}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Info Card / Summary Box */}
      <View style={styles.paymentInfoCard}>
        <Text style={styles.paymentCardLabel}>From Friend</Text>
        <Text style={styles.paymentFriendName}>
          {selectedFriendToSettle?.friends?.full_name || 'Friend'}
        </Text>
        
        <View style={styles.paymentCardDivider} />
        
        <View style={styles.paymentBalanceRow}>
          <Text style={styles.paymentCardLabel}>Current Balance Owed:</Text>
          <Text style={styles.paymentOwedAmount}>
            ₱{(selectedFriendToSettle?.owed_amount || 0).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Input Section */}
      <Text style={[styles.label, { marginBottom: 6 }]}>Amount Received (₱)</Text>
      <TextInput
        style={styles.paymentInput}
        placeholder="0.00"
        placeholderTextColor={colors.textFaint}
        keyboardType="numeric"
        value={paymentInputAmount}
        onChangeText={setPaymentInputAmount}
        autoFocus={true}
      />

      {/* Submit Button */}
      <TouchableOpacity
        style={styles.paymentSubmitBtn}
        onPress={handleConfirmSettlePayment}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
        <Text style={styles.paymentSubmitBtnText}>Confirm & Add to Income</Text>
      </TouchableOpacity>

    </View>
  </View>
</Modal>

      {/* CUSTOM ALERT MODAL */}
      <Modal visible={alertConfig.visible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <Text style={styles.modalTitle}>{alertConfig.title}</Text>
            <Text style={[styles.modalSub, { marginTop: 8 }]}>{alertConfig.message}</Text>
            <TouchableOpacity
              style={[styles.submitBtn, { marginTop: 12 }]}
              onPress={() => setAlertConfig({ visible: false, title: '', message: '' })}
            >
              <Text style={styles.submitBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}