// app/help.tsx
import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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

interface Message {
  id: string;
  sender: 'user' | 'payton';
  text: string;
  extractedData?: {
    amount: number;
    category: string;
    description: string;
  };
}

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export default function HelpScreen() {
  const router = useRouter();
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'payton', text: "Hello! I am Payton, your AI assistant. How can I help you today regarding the system or your finances?" }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<ScrollView>(null);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputText.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText.trim();
    setInputText('');
    setLoading(true);

    try {
      if (!apiKey) throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY in .env");

      // 🔑 Get the current authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user found");

      // 📅 Get the start date of the current month
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      
      // 📊 STEP A: Fetch expenses using relational join
      const { data: userExpenses, error: expensesError } = await supabase
        .from('expenses')
        .select(`
          amount,
          description,
          spent_at,
          budgets!inner (
            id,
            user_id,
            allocated_amount,
            categories ( name )
          )
        `)
        .eq('budgets.user_id', user.id)
        .gte('spent_at', startOfMonth);

      if (expensesError) {
        console.error("❌ Supabase Expenses Fetch Error:", expensesError.message);
      }

      // 📊 STEP B: Fetch budgets
      const { data: userBudgets, error: budgetsError } = await supabase
        .from('budgets')
        .select(`
          allocated_amount,
          categories ( name )
        `)
        .eq('user_id', user.id);

      if (budgetsError) {
        console.error("❌ Supabase Budgets Fetch Error:", budgetsError.message);
      }

      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.5-flash-lite",
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const systemInstruction = `
        You are Payton, a smart financial tracking assistant, system help desk advisor, and customer support for the Payton mobile app.
        Today's date is ${new Date().toDateString()}.

        Your job is to analyze the user's input. Decide whether they want to log an expense ("intent": "LOG_EXPENSE"), ask a question about their spending/budget ("intent": "ASK_INSIGHT"), or ask for system help/FAQ troubleshooting ("intent": "SYSTEM_HELP").

        ALLOWED CATEGORIES: ["Entertainment", "Rent", "Utilities", "Transportation", "Food & Dining", "Shopping", "Education", "Healthcare"]

        USER'S FINANCIAL DATA CONTEXT:
        - Recent Expenses This Month: ${JSON.stringify(userExpenses || [])}
        - Current Active Budgets: ${JSON.stringify(userBudgets || [])}

        DIRECTIONS:
        - If it's a technical or system help question (e.g. password reset, email updates, security, app features), answer it clearly, helpfully, and warmly in English (or Visayan if appropriate, but English/Taglish is great for financial clarity).
        - If they want to log an expense or ask insights, use the financial context data.
        - Return a strict raw JSON matching this schema:
        {
          "intent": "LOG_EXPENSE" | "ASK_INSIGHT" | "SYSTEM_HELP",
          "reply": "Your response to the user.",
          "amount": number (numeric float value if LOG_EXPENSE, otherwise 0),
          "category": "string (strictly pick one from Allowed categories if logging expense, otherwise empty string)",
          "description": "string (short details if logging expense, otherwise empty string)"
        }
      `;

      const result = await model.generateContent([systemInstruction, `User Input: ${currentInput}`]);
      const responseText = result.response.text();
      
      const cleanJsonText = responseText.replace(/```json|```/g, '').trim();
      const extractedData = JSON.parse(cleanJsonText);

      let savedDataToDisplay = undefined;

      // 💾 CONDITION: If the user intends to LOG an expense from Help desk chat
      if (extractedData.intent === 'LOG_EXPENSE' && extractedData.amount > 0) {
        let targetBudgetId = null;

        const { data: categoryData } = await supabase
          .from('categories')
          .select('id')
          .eq('name', extractedData.category)
          .maybeSingle();

        if (categoryData) {
          const { data: budgetData } = await supabase
            .from('budgets')
            .select('id')
            .eq('user_id', user.id)
            .eq('category_id', categoryData.id)
            .maybeSingle();

          if (budgetData) {
            targetBudgetId = budgetData.id;
          }
        }

        const { error: insertError } = await supabase
          .from('expenses')
          .insert([
            {
              user_id: user.id, 
              budget_id: targetBudgetId,
              amount: Number(extractedData.amount || 0),
              description: extractedData.description || 'Expense logged via Help Desk',
              spent_at: new Date().toISOString()
            },
          ]);

        if (!insertError) {
          savedDataToDisplay = {
            amount: Number(extractedData.amount),
            category: extractedData.category,
            description: extractedData.description
          };
        }
      }

      const paytonMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'payton',
        text: extractedData.reply,
        extractedData: savedDataToDisplay
      };

      setMessages(prev => [...prev, paytonMessage]);

    } catch (error) {
      console.error("🚨 Help Chat Flow Error:", error);
      const errorReply: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'payton',
        text: "Pasayloha ko, buddy. Naa koy gamit nga nasugatan sa pagtubag karon. Palihog og sulayi og usab."
      };
      setMessages(prev => [...prev, errorReply]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Help Desk</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Frequently Asked Questions</Text>
        
        {[
          { q: "How do I update my email?", a: "Registered email addresses are locked for security. Please contact our administrators to submit an update request." },
          { q: "How do I reset my password?", a: "You can securely reset your password by tapping 'Forgot Password' on the login screen, or via your profile settings if you are currently logged in." },
          { q: "Is my balance ledger encrypted?", a: "Yes, Payton uses end-to-end Row Level Security protocols integrated securely via Supabase database networks." },
          { q: "How long do image uploads take?", a: "Avatar uploads stream in real-time, generally updating within 2-5 seconds depending on network bandwidth." }
        ].map((faq, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.questionText}>{faq.q}</Text>
            <Text style={styles.answerText}>{faq.a}</Text>
          </View>
        ))}

        <TouchableOpacity 
          style={styles.pillPrimaryActionBtn} 
          onPress={() => setChatVisible(true)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.pillPrimaryActionBtnText}>Ask Payton for help</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Interactive Chat Modal */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setChatVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlay}
        >
          <View style={styles.chatContainer}>
            {/* Chat Header */}
            <View style={styles.chatHeader}>
              <View style={styles.chatHeaderInfo}>
                <View style={styles.aiAvatar}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.chatTitle}>Ask Payton</Text>
                  <Text style={styles.chatSubtitle}>AI Financial & System Assistant</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#1E293B" />
              </TouchableOpacity>
            </View>

            {/* Chat Messages */}
            <ScrollView 
              ref={flatListRef}
              contentContainerStyle={styles.chatScroll} 
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((msg) => (
                <View 
                  key={msg.id} 
                  style={[
                    styles.messageBubble, 
                    msg.sender === 'user' ? styles.userBubble : styles.paytonBubble
                  ]}
                >
                  <Text style={[
                    styles.messageText, 
                    msg.sender === 'user' ? styles.userText : styles.paytonText
                  ]}>
                    {msg.text}
                  </Text>

                  {/* DYNAMIC EXPENSE CARD IF LOGGED VIA HELP CHAT */}
                  {msg.extractedData && msg.extractedData.amount > 0 && (
                    <View style={styles.dataCard}>
                      <View style={styles.dataRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={styles.dataCardTitle}>Logged Successfully!</Text>
                      </View>
                      <Text style={styles.dataDetails}>
                        ₱{msg.extractedData.amount} • {msg.extractedData.category}
                      </Text>
                      <TouchableOpacity style={styles.viewBtn} onPress={() => { setChatVisible(false); router.push('/transaction'); }}>
                        <Text style={styles.viewBtnText}>View Records</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
              {loading && (
                <View style={[styles.messageBubble, styles.paytonBubble, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <ActivityIndicator size="small" color="#173D45" />
                  <Text style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>Thinking...</Text>
                </View>
              )}
            </ScrollView>

            {/* Chat Input Area */}
            <View style={styles.chatInputContainer}>
              <TextInput
                style={styles.chatInput}
                placeholder="Ask Payton..."
                placeholderTextColor="#94A3B8"
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage} disabled={loading}>
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  scrollContent: { 
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 40 
  },
  sectionLabel: { 
    fontSize: 12, 
    fontWeight: '700', 
    color: '#94A3B8', 
    textTransform: 'uppercase', 
    marginBottom: 16, 
    letterSpacing: 0.5 
  },
  faqCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 20, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  questionText: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 6 
  },
  answerText: { 
    fontSize: 14, 
    color: '#64748B', 
    lineHeight: 22 
  },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  pillPrimaryActionBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700', 
    letterSpacing: 0.5 
  },
  // Modal & Chat Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatContainer: {
    height: '75%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  chatHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#173D45',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  chatSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  closeBtn: {
    padding: 4,
  },
  chatScroll: {
    paddingVertical: 15,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  userBubble: {
    backgroundColor: '#173D45',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  paytonBubble: {
    backgroundColor: '#F1F5F9',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  paytonText: {
    color: '#1E293B',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#173D45',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  dataCard: { 
    backgroundColor: '#F8FAFC', 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 12, 
    padding: 10, 
    marginTop: 10, 
    minWidth: 160 
  },
  dataRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6 
  },
  dataCardTitle: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    color: '#10B981' 
  },
  dataDetails: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#2D3748', 
    marginVertical: 4 
  },
  viewBtn: { 
    backgroundColor: '#173D45', 
    borderRadius: 6, 
    paddingVertical: 5, 
    alignItems: 'center', 
    marginTop: 4 
  },
  viewBtnText: { 
    color: '#FFFFFF', 
    fontSize: 11, 
    fontWeight: 'bold' 
  }
});