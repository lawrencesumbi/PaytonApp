import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { supabase } from '../../lib/supabase';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

interface PacingResult {
    pacingStatus: 'ON_TRACK' | 'WARNING' | 'CRITICAL';
    safeDailyLimit: number;
    projectedRunwayDays: number;
    insightSummary: string;
    actionableTip: string;
    total_allowance: number;
    total_spent: number;
    remaining_balance: number;
}

interface Message {
    id: string;
    sender: 'user' | 'coach';
    type: 'text' | 'pacing';
    content?: string;
    pacingData?: PacingResult;
}

export default function InsightScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [typing, setTyping] = useState(false);
    const [inputText, setInputText] = useState('');
    const flatListRef = useRef<FlatList>(null);

    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            sender: 'coach',
            type: 'text',
            content: "Hi there! How can I help you today?",
        },
    ]);

    const handleFetchPacingInsights = async () => {
        try {
            setLoading(true);
            setTyping(true);

            const userMsg: Message = {
                id: Date.now().toString(),
                sender: 'user',
                type: 'text',
                content: 'Check My Financial Status',
            };
            setMessages((prev) => [...prev, userMsg]);

            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw new Error('User session not found.');

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const isPersonal = profile?.role === 'Personal';
            const rpcName = isPersonal ? 'get_personal_pacing_data' : 'get_spender_pacing_data';
            const rpcParams = isPersonal ? { p_user_id: user.id } : { p_spender_id: user.id };

            const { data: metrics, error: dbError } = await supabase.rpc(rpcName, rpcParams);

            if (dbError) throw dbError;
            if (!metrics || !metrics.has_active_allowance) {
                throw new Error(isPersonal ? 'No active income period found.' : 'No active income found for this period.');
            }

            const model = genAI.getGenerativeModel({ 
                model: "gemini-3.5-flash-lite",
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `
                Analyze these pacing metrics (${isPersonal ? 'Personal Income Source' : 'Spender Allowance'}):
                ${JSON.stringify(metrics)}

                Rules:
                1. "pacingStatus": WARNING if current_daily_avg > safe_daily_limit, CRITICAL if remaining_balance < pending_reminders, else ON_TRACK.
                2. "safeDailyLimit": Set to ${metrics.safe_daily_limit}.
                3. "projectedRunwayDays": Calculate remaining_balance / current_daily_avg (1 decimal place). If current_daily_avg is 0, return remaining_balance.
                4. "insightSummary": 2 sentences explaining why they are burning through funds faster than their safe limit.
                5. "actionableTip": 1 actionable tip addressing their top_spending_category (${metrics.top_spending_category}) and pending_reminders (₱${metrics.pending_reminders}).
            `;

            const result = await model.generateContent(prompt);
            const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanText) as PacingResult;

            parsedData.total_allowance = metrics.total_allowance;
            parsedData.total_spent = metrics.total_spent;
            parsedData.remaining_balance = metrics.remaining_balance;

            const coachMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'pacing',
                pacingData: parsedData,
            };
            setMessages((prev) => [...prev, coachMsg]);
        } catch (err: any) {
            Alert.alert('Pacing Analysis Failed ❌', err.message || 'Unable to fetch insights.');
        } finally {
            setLoading(false);
            setTyping(false);
        }
    };

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;

        const userText = inputText.trim();
        setInputText('');

        const userMsg: Message = {
            id: Date.now().toString(),
            sender: 'user',
            type: 'text',
            content: userText,
        };

        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);
        setTyping(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not found');

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const isPersonal = profile?.role === 'Personal';
            const rpcName = isPersonal ? 'get_personal_pacing_data' : 'get_spender_pacing_data';
            const rpcParams = isPersonal ? { p_user_id: user.id } : { p_spender_id: user.id };
            const { data: metrics } = await supabase.rpc(rpcName, rpcParams);

            // Kuhaa ang pending reminders gikan sa database
            const { data: remindersData } = await supabase
                .from('reminders')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'pending');

            // Kuhaa ang mga utang ug status gikan sa split_friends table
            const { data: splitFriendsData } = await supabase
                .from('split_friends')
                .select(`
                    *,
                    friends (
                        name
                    )
                `);

            const model = genAI.getGenerativeModel({ 
                model: "gemini-3.5-flash-lite",
                generationConfig: { responseMimeType: "application/json" }
            });

            const classificationPrompt = `
                You are Coach Payton, an intelligent AI financial coach with direct database access.
                User Message: "${userText}"
                Active Pacing Metrics: ${JSON.stringify(metrics)}
                Pending Reminders: ${JSON.stringify(remindersData || [])}
                Split Friends Debts Data: ${JSON.stringify(splitFriendsData || [])}

                Determine the intent of the user. Return a JSON object with:
                - intent: "EXPENSE_LOG" or "DATABASE_QUERY" or "GENERAL_CHAT"
                - expenseAmount: number or null (if intent is EXPENSE_LOG)
                - expenseDescription: string or null (if intent is EXPENSE_LOG)
                - categoryName: string or null (match closest like Food, Transport, Bills, etc.)
                - replyText: string (Direct response to the user. If EXPENSE_LOG and amount > remaining_balance, reject it gracefully. If DATABASE_QUERY regarding reminders/debts, answer it using the provided pending reminders data. If GENERAL_CHAT, provide a coaching response.)
            `;

            const classificationResult = await model.generateContent(classificationPrompt);
            const cleanClassificationText = classificationResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedIntent = JSON.parse(cleanClassificationText);

            if (parsedIntent.intent === 'EXPENSE_LOG' && parsedIntent.expenseAmount !== null) {
                const expenseAmount = Number(parsedIntent.expenseAmount);
                const remainingBalance = metrics?.remaining_balance || 0;

                if (expenseAmount > remainingBalance) {
                    const rejectionMsg: Message = {
                        id: (Date.now() + 1).toString(),
                        sender: 'coach',
                        type: 'text',
                        content: `⚠️ Pasensya na, dili nako ma-log kana nga gasto (₱${expenseAmount}). Ang imong nahibiling balanse kay ₱${remainingBalance} na lang! Kulang ang imong budget.`,
                    };
                    setMessages((prev) => [...prev, rejectionMsg]);
                    return;
                }

                const activeId = metrics?.has_active_allowance ? (isPersonal ? metrics.income_id : metrics.allowance_id) : null;

                let budgetId = null;
                if (parsedIntent.categoryName) {
                    const { data: catData } = await supabase
                        .from('categories')
                        .select('id')
                        .ilike('name', `%${parsedIntent.categoryName}%`)
                        .single();

                    if (catData) {
                        const { data: budgetData } = await supabase
                            .from('budgets')
                            .select('id')
                            .eq(isPersonal ? 'income_id' : 'allowance_id', activeId)
                            .eq('category_id', catData.id)
                            .single();
                        budgetId = budgetData?.id || null;
                    }
                }

                const insertPayload: any = {
                    amount: expenseAmount,
                    description: parsedIntent.expenseDescription || userText,
                    budget_id: budgetId,
                };
                if (isPersonal) {
                    insertPayload.income_id = activeId;
                } else {
                    insertPayload.allowance_id = activeId;
                }

                const { error: insertError } = await supabase.from('expenses').insert([insertPayload]);
                if (insertError) throw insertError;

                const successMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    sender: 'coach',
                    type: 'text',
                    content: `✅ Na-log na nako ang imong gasto nga ₱${expenseAmount} (${parsedIntent.expenseDescription || 'Expense'}). Gidawat kini kay sakto pa ang imong balanse!`,
                };
                setMessages((prev) => [...prev, successMsg]);

            } else {
                const coachMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    sender: 'coach',
                    type: 'text',
                    content: parsedIntent.replyText || "Naa koy nadawat nga tubag apan wala kini kahulugan. Palihog sulayi og usab!",
                };
                setMessages((prev) => [...prev, coachMsg]);
            }

        } catch (err: any) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'text',
                content: "Naa ko'y nadungog nga problema sa pagkonekta sa database. Palihog sulayi og usab!",
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setLoading(false);
            setTyping(false);
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'ON_TRACK': return '#7EA00E';
            case 'WARNING': return '#DCD964';
            case 'CRITICAL': return '#1F4F59';
            default: return '#54C9CC';
        }
    };

    const renderItem = ({ item }: { item: Message }) => {
        if (item.sender === 'user') {
            return (
                <View style={styles.userMessageRow}>
                    <View style={styles.userBubble}>
                        <Text style={styles.userText}>{item.content}</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.coachMessageRow}>
                <Image 
                    source={require("../../assets/images/coachpayton.png")} 
                    style={styles.chatAvatar} 
                />
                <View style={styles.coachContentContainer}>
                    {item.type === 'text' && (
                        <View style={styles.coachBubble}>
                            <Text style={styles.coachText}>{item.content}</Text>
                        </View>
                    )}

                    {item.type === 'pacing' && item.pacingData && (
                        <View style={styles.resultContainer}>
                            <View style={[styles.statusBadge, { backgroundColor: '#E6F0F2' }]}>
                                <Ionicons name="warning" size={18} color={getStatusColor(item.pacingData.pacingStatus)} />
                                <Text style={[styles.statusText, { color: getStatusColor(item.pacingData.pacingStatus) }]}>
                                    {item.pacingData.pacingStatus}
                                </Text>
                            </View>

                            <View style={styles.progressSection}>
                                <View style={styles.progressLabels}>
                                    <Text style={styles.progressLabelText}>Spent: ₱{item.pacingData.total_spent || 0}</Text>
                                    <Text style={styles.progressLabelText}>Total: ₱{item.pacingData.total_allowance || 0}</Text>
                                </View>
                                <View style={styles.progressBarBackground}>
                                    <View 
                                        style={[
                                            styles.progressBarFill, 
                                            { 
                                                width: `${Math.min(
                                                    ((item.pacingData.total_spent || 0) / (item.pacingData.total_allowance || 1)) * 100, 
                                                    100
                                                )}%` 
                                            }
                                        ]} 
                                    />
                                </View>
                            </View>

                            <View style={styles.metricsRow}>
                                <View style={styles.metricCard}>
                                    <Text style={styles.metricLabel}>Safe Daily Limit</Text>
                                    <Text style={styles.metricValue}>₱{item.pacingData.safeDailyLimit.toFixed(2)}</Text>
                                </View>
                                <View style={styles.metricCard}>
                                    <Text style={styles.metricLabel}>Projected Runway</Text>
                                    <Text style={styles.metricValue}>{item.pacingData.projectedRunwayDays} Days</Text>
                                </View>
                            </View>

                            <View style={styles.summaryBox}>
                                <Text style={styles.summaryTitle}>AI Summary</Text>
                                <Text style={styles.summaryText}>{item.pacingData.insightSummary}</Text>
                            </View>

                            <View style={styles.tipCard}>
                                <Ionicons name="bulb-outline" size={20} color="#7EA00E" />
                                <View style={styles.tipTextContainer}>
                                    <Text style={styles.tipTitle}>Recommended Action</Text>
                                    <Text style={styles.tipDescription}>{item.pacingData.actionableTip}</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.safeArea}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={styles.modalOverlay}
            >
                <View style={styles.mainContainer}>
                    <View style={styles.headerRow}>
                        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={24} color="#1F4F59" />
                        </TouchableOpacity>
                        
                        <View style={styles.headerTitleRow}>
                            <Image 
                                source={require("../../assets/images/coachpayton.png")} 
                                style={styles.headerAvatar} 
                            />
                            <View style={styles.titleContainer}>
                                <Text style={styles.screenTitle}>Coach Payton</Text>
                                <Text style={styles.screenSubtitle}>Your AI Financial Coach</Text>
                            </View>
                        </View>
                    </View>

                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.chatScrollContent}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        keyboardShouldPersistTaps="handled"
                    />

                    {typing && (
                        <View style={styles.coachMessageRow}>
                            <Image 
                                source={require("../../assets/images/coachpayton.png")} 
                                style={styles.chatAvatar} 
                            />
                            <View style={styles.coachBubble}>
                                <Text style={[styles.coachText, { fontStyle: 'italic', color: '#68898F' }]}>
                                    Coach Payton is typing...
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.bottomBarContainer}>
                        <TouchableOpacity
                            style={styles.checkPacingInlineBtn}
                            onPress={handleFetchPacingInsights}
                            disabled={loading}
                        >
                            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                            <Text style={styles.checkPacingInlineText}>Check My Financial Status</Text>
                        </TouchableOpacity>

                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Ask Coach Payton or log expense..."
                                placeholderTextColor="#94A3B8"
                                value={inputText}
                                onChangeText={setInputText}
                            />
                            <TouchableOpacity 
                                style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]} 
                                onPress={handleSendMessage}
                                disabled={!inputText.trim() || loading}
                            >
                                <Ionicons name="send" size={18} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#1F4F59' },
    mainContainer: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        marginTop: 40,
        paddingTop: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 16,
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#E6F0F2',
    },
    backButton: { padding: 4 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerAvatar: { width: 36, height: 36, borderRadius: 18 },
    titleContainer: { flexDirection: 'column' },
    screenTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F4F59' },
    screenSubtitle: { fontSize: 11, color: '#68898F', marginTop: 1 },
    chatScrollContent: { padding: 16, paddingBottom: 20 },
    userMessageRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 6 },
    userBubble: {
        backgroundColor: '#1F4F59',
        borderRadius: 16,
        borderBottomRightRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: '80%',
    },
    userText: { color: '#FFFFFF', fontSize: 14 },
    coachMessageRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 8, paddingHorizontal: 16, gap: 8 },
    chatAvatar: { width: 30, height: 30, borderRadius: 15, marginTop: 2 },
    coachContentContainer: { flex: 1 },
    coachBubble: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E6F0F2',
        maxWidth: '90%',
    },
    coachText: { color: '#1F4F59', fontSize: 14, lineHeight: 20 },
    resultContainer: { 
        marginTop: 4, 
        gap: 10,
        backgroundColor: '#FFFFFF',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E6F0F2',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    statusText: { fontWeight: '700', fontSize: 11 },
    progressSection: { gap: 6, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E6F0F2' },
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    progressLabelText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
    progressBarBackground: { height: 8, backgroundColor: '#E6F0F2', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#1F4F59', borderRadius: 4 },
    metricsRow: { flexDirection: 'row', gap: 8 },
    metricCard: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E6F0F2',
    },
    metricLabel: { fontSize: 11, color: '#64748B', fontWeight: '500' },
    metricValue: { fontSize: 15, fontWeight: '700', color: '#414546', marginTop: 2 },
    summaryBox: {
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E6F0F2',
    },
    summaryTitle: { fontSize: 12, fontWeight: '700', color: '#1F4F59', marginBottom: 2 },
    summaryText: { fontSize: 12, color: '#213502', lineHeight: 17 },
    tipCard: {
        flexDirection: 'row',
        gap: 8,
        backgroundColor: '#F4F8E8',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#DCD964',
    },
    tipTextContainer: { flex: 1 },
    tipTitle: { fontSize: 12, fontWeight: '700', color: '#213502' },
    tipDescription: { fontSize: 11, color: '#213502', marginTop: 1, lineHeight: 15 },
    bottomBarContainer: {
        padding: 12,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E6F0F2',
        gap: 8,
    },
    checkPacingInlineBtn: {
        backgroundColor: '#1F4F59',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 10,
        gap: 6,
    },
    checkPacingInlineText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    textInput: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E6F0F2',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: '#1F4F59',
    },
    sendButton: {
        backgroundColor: '#1F4F59',
        justifyContent: 'center',
        alignItems: 'center',
        width: 40,
        height: 40,
        borderRadius: 12,
    },
    sendButtonDisabled: { backgroundColor: '#94A3B8' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
});