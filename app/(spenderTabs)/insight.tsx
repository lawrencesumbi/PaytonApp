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
            content: "Hi there! How can I help with you today?",
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
                generationConfig: {
                    responseMimeType: "application/json",
                }
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
            const parsedData = JSON.parse(result.response.text()) as PacingResult;

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
            const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
            const chatSession = model.startChat({
                history: [
                    { role: "user", parts: [{ text: "You are Coach Payton, a helpful, encouraging, yet direct AI financial coach for a personal finance app." }] },
                    { role: "model", parts: [{ text: "Understood! I'm Coach Payton, ready to help you manage your budget and stay on track." }] }
                ]
            });

            const result = await chatSession.sendMessage(userText);
            const responseText = result.response.text();

            const coachMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'text',
                content: responseText,
            };
            setMessages((prev) => [...prev, coachMsg]);
        } catch (err: any) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'text',
                content: "I'm having trouble connecting right now. Please try again later!",
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

            {/* Giputos sa KeyboardAvoidingView ang buok mainContainer aron ma-push sa keyboard ang bottom bar */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={styles.modalOverlay}
            >
                <View style={styles.mainContainer}>
                    {/* Header */}
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

                    {/* Chat Feed */}
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.chatScrollContent}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        keyboardShouldPersistTaps="handled"
                    />

                    {/* Typing Indicator */}
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

                    {/* Bottom Bar Container */}
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
                                placeholder="Ask Coach Payton anything..."
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
    safeArea: { 
        flex: 1, 
        backgroundColor: '#1F4F59' 
    },
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
    backButton: {
        padding: 4,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    titleContainer: {
        flexDirection: 'column',
    },
    screenTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1F4F59',
    },
    screenSubtitle: {
        fontSize: 11,
        color: '#68898F',
        marginTop: 1,
    },
    chatScrollContent: { 
        padding: 16, 
        paddingBottom: 20,
    },
    userMessageRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginVertical: 6,
    },
    userBubble: {
        backgroundColor: '#1F4F59',
        borderRadius: 16,
        borderBottomRightRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: '80%',
    },
    userText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    coachMessageRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginVertical: 8,
        paddingHorizontal: 16,
        gap: 8,
    },
    chatAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginTop: 2,
    },
    coachContentContainer: {
        flex: 1,
    },
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
    coachText: {
        color: '#1F4F59',
        fontSize: 14,
        lineHeight: 20,
    },
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
    checkPacingInlineText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 13,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
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
    sendButtonDisabled: {
        backgroundColor: '#94A3B8',
    },
    modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});