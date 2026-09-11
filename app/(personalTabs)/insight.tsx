import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function InsightScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [pacingData, setPacingData] = useState<PacingResult | null>(null);

    const handleFetchPacingInsights = async () => {
        try {
            setLoading(true);

            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw new Error('User session not found.');

            const { data: metrics, error: dbError } = await supabase.rpc('get_spender_pacing_data', {
                p_spender_id: user.id,
            });

            if (dbError) throw dbError;
            if (!metrics || !metrics.has_active_allowance) {
                throw new Error('No active allowance found for this period.');
            }

            const schema = {
                type: SchemaType.OBJECT,
                properties: {
                    pacingStatus: {
                        type: SchemaType.STRING,
                        enum: ['ON_TRACK', 'WARNING', 'CRITICAL'],
                    },
                    safeDailyLimit: { type: SchemaType.NUMBER },
                    projectedRunwayDays: { type: SchemaType.NUMBER },
                    insightSummary: { type: SchemaType.STRING },
                    actionableTip: { type: SchemaType.STRING },
                },
                required: [
                    'pacingStatus',
                    'safeDailyLimit',
                    'projectedRunwayDays',
                    'insightSummary',
                    'actionableTip',
                ],
            };
            
            const model = genAI.getGenerativeModel({ 
            model: "gemini-3.5-flash-lite",
            generationConfig: {
                responseMimeType: "application/json",
            }
            });

            const prompt = `
                Analyze these spender pacing metrics:
                ${JSON.stringify(metrics)}

                Rules:
                1. "pacingStatus": WARNING if current_daily_avg > safe_daily_limit, CRITICAL if remaining_balance < pending_reminders, else ON_TRACK.
                2. "safeDailyLimit": Set to ${metrics.safe_daily_limit}.
                3. "projectedRunwayDays": Calculate remaining_balance / current_daily_avg (1 decimal place).
                4. "insightSummary": 2 sentences explaining why they are burning through allowance faster than their safe limit.
                5. "actionableTip": 1 actionable tip addressing their top_spending_category (${metrics.top_spending_category}) and pending_reminders (₱${metrics.pending_reminders}).
            `;

            const result = await model.generateContent(prompt);
            const parsedData = JSON.parse(result.response.text()) as PacingResult;

            setPacingData(parsedData);
        } catch (err: any) {
            Alert.alert('Pacing Analysis Failed ❌', err.message || 'Unable to fetch insights.');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'ON_TRACK': return '#7EA00E'; // olive
            case 'WARNING': return '#DCD964';  // yellowGreen
            case 'CRITICAL': return '#1F4F59'; // headerDark
            default: return '#54C9CC';         // cyan
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />

            {/* Main Content Wrapper with Rounded Top Corners */}
            <View style={styles.mainContainer}>
                {/* Custom Top Navigation Bar */}
                <View style={styles.headerRow}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color="#1F4F59" />
                    </TouchableOpacity>
                    <Text style={styles.screenTitle}>AI Pacing Insights</Text>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.heroCard}>
                        <View style={styles.iconBadge}>
                            <Ionicons name="sparkles" size={24} color="#1F4F59" />
                        </View>
                        <Text style={styles.heroTitle}>Smart Cash Flow Pacing</Text>
                        <Text style={styles.heroSubtitle}>
                            Get instant velocity alerts based on active allowance and pending commitments.
                        </Text>

                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={handleFetchPacingInsights}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.actionBtnText}>Check My Pacing</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {pacingData && (
                        <View style={styles.resultContainer}>
                            <View style={[styles.statusBadge, { backgroundColor: '#E6F0F2' }]}>
                                <Ionicons name="warning" size={18} color={getStatusColor(pacingData.pacingStatus)} />
                                <Text style={[styles.statusText, { color: getStatusColor(pacingData.pacingStatus) }]}>
                                    {pacingData.pacingStatus}
                                </Text>
                            </View>

                            <View style={styles.metricsRow}>
                                <View style={styles.metricCard}>
                                    <Text style={styles.metricLabel}>Safe Daily Limit</Text>
                                    <Text style={styles.metricValue}>₱{pacingData.safeDailyLimit.toFixed(2)}</Text>
                                </View>
                                <View style={styles.metricCard}>
                                    <Text style={styles.metricLabel}>Projected Runway</Text>
                                    <Text style={styles.metricValue}>{pacingData.projectedRunwayDays} Days</Text>
                                </View>
                            </View>

                            <View style={styles.summaryBox}>
                                <Text style={styles.summaryTitle}>AI Summary</Text>
                                <Text style={styles.summaryText}>{pacingData.insightSummary}</Text>
                            </View>

                            <View style={styles.tipCard}>
                                <Ionicons name="bulb-outline" size={20} color="#7EA00E" />
                                <View style={styles.tipTextContainer}>
                                    <Text style={styles.tipTitle}>Recommended Action</Text>
                                    <Text style={styles.tipDescription}>{pacingData.actionableTip}</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { 
        flex: 1, 
        backgroundColor: '#1F4F59' // Dark teal matching the status bar background area 
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
        paddingVertical: 16,
        gap: 16,
        backgroundColor: '#F8FAFC',
    },
    backButton: {
        padding: 4,
    },
    screenTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F4F59',
    },
    scrollContent: { 
        padding: 20, 
        paddingTop: 4 
    },
    heroCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E6F0F2',
    },
    iconBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E6F0F2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    heroTitle: { fontSize: 18, fontWeight: '700', color: '#1F4F59' },
    heroSubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4, lineHeight: 18 },
    actionBtn: {
        backgroundColor: '#1F4F59',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        marginTop: 16,
        width: '100%',
        alignItems: 'center',
    },
    actionBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
    resultContainer: { marginTop: 20, gap: 14 },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },
    statusText: { fontWeight: '700', fontSize: 12 },
    metricsRow: { flexDirection: 'row', gap: 12 },
    metricCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E6F0F2',
    },
    metricLabel: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    metricValue: { fontSize: 18, fontWeight: '700', color: '#1F4F59', marginTop: 4 },
    summaryBox: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E6F0F2',
    },
    summaryTitle: { fontSize: 14, fontWeight: '700', color: '#1F4F59', marginBottom: 4 },
    summaryText: { fontSize: 13, color: '#213502', lineHeight: 19 },
    tipCard: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: '#F4F8E8',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#DCD964',
    },
    tipTextContainer: { flex: 1 },
    tipTitle: { fontSize: 13, fontWeight: '700', color: '#213502' },
    tipDescription: { fontSize: 12, color: '#213502', marginTop: 2, lineHeight: 17 },
});