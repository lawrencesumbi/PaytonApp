import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  extractedData?: {
    amount: number;
    category: string;
    description: string;
  };
}

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export default function ChatCoachScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hey buddy! I am your AI Financial Coach. You can log an expense (e.g., "Bought coffee for 180") or ask questions about your money (e.g., "How much did I spend this week?"). Just chat with me here!',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    if (inputText.trim() === '') return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

  	setMessages((prev) => [...prev, userMsg]);
    const currentInput = inputText;
    setInputText('');
    setIsLoading(true);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      if (!apiKey) throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY in .env");

      // 🔑 Get the current authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user found");

      // 📅 Get the start date of the current month
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      
      // 📊 STEP A: Fetch expenses using a relational inner join with the budgets table (to filter by user.id)
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
            remaining_amount,
            categories ( name )
          )
        `)
        .eq('budgets.user_id', user.id)
        .gte('spent_at', startOfMonth);

      if (expensesError) {
        console.error("❌ Supabase Expenses Fetch Error:", expensesError.message);
      } else {
        console.log("📊 Total expenses fetched:", userExpenses?.length);
      }

      // 📊 STEP B: Fetch budgets to view allocation and limits per category
      const { data: userBudgets, error: budgetsError } = await supabase
        .from('budgets')
        .select(`
          allocated_amount,
          remaining_amount,
          categories ( name )
        `)
        .eq('user_id', user.id);

      if (budgetsError) {
        console.error("❌ Supabase Budgets Fetch Error:", budgetsError.message);
      }

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const systemInstruction = `
        You are a smart financial tracking assistant and advisor for a mobile app named Payton.
        Today's date is ${new Date().toDateString()}.

        Your job is to analyze the user's input. Decide whether they want to log an expense ("intent": "LOG_EXPENSE") or ask a question about their spending/budget ("intent": "ASK_INSIGHT").

        ALLOWED CATEGORIES: ["Entertainment", "Rent", "Utilities", "Transportation", "Food & Dining", "Shopping", "Education", "Healthcare"]

        USER'S FINANCIAL DATA CONTEXT:
        - Recent Expenses This Month: ${JSON.stringify(userExpenses || [])}
        - Current Active Budgets: ${JSON.stringify(userBudgets || [])}

        DIRECTIONS FOR "ASK_INSIGHT":
        - Analyze the provided FINANCIAL DATA CONTEXT to answer the user's question accurately.
        - Do the math (summing, comparing, checking balance) based on the context data.
        - Answer directly, warmly, and encouragingly in English.

        Return a strict raw JSON matching this schema:
        {
          "intent": "LOG_EXPENSE" or "ASK_INSIGHT",
          "reply": "Your response to the user in English.",
          
          // Only required if intent is LOG_EXPENSE:
          "amount": number (numeric float value, no currency symbols),
          "category": "string (strictly pick one from Allowed categories)",
          "description": "string (short details about the expense)"
        }
      `;

      const result = await model.generateContent([systemInstruction, `User Input: ${currentInput}`]);
      const responseText = result.response.text();
      
      const cleanJsonText = responseText.replace(/```json|```/g, '').trim();
      const extractedData = JSON.parse(cleanJsonText);

      let savedDataToDisplay = undefined;

      // 💾 CONDITION: If the user intends to LOG an expense
      if (extractedData.intent === 'LOG_EXPENSE' && extractedData.amount > 0) {
        let targetBudgetId = null;

        // STEP 1: Match the category name
        const { data: categoryData } = await supabase
          .from('categories')
          .select('id')
          .eq('name', extractedData.category)
          .maybeSingle();

        if (categoryData) {
          // STEP 2: Find the user's active budget for that category
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

        // STEP 3: Insert into the expenses table
        const { error: insertError } = await supabase
          .from('expenses')
          .insert([
            {
              user_id: user.id, 
              budget_id: targetBudgetId,
              amount: Number(extractedData.amount || 0),
              description: extractedData.description || 'Expense from AI Chat',
              spent_at: new Date().toISOString()
            },
          ]);

        if (insertError) {
          console.error("❌ Supabase Insertion Error:", insertError.message);
        } else {
          savedDataToDisplay = {
            amount: Number(extractedData.amount),
            category: extractedData.category,
            description: extractedData.description
          };
          console.log("🔥 Successfully logged via AI coach!");
        }
      }

      // 💬 Update the chat UI with the response from the AI
      const botReply: Message = {
        id: Date.now().toString(),
        text: extractedData.reply, 
        sender: 'bot',
        timestamp: new Date(),
        extractedData: savedDataToDisplay
      };
      
      setMessages((prev) => [...prev, botReply]);

    } catch (error) {
      console.error("🚨 General Chat Flow Error:", error);
      const errorReply: Message = {
        id: Date.now().toString(),
        text: "I'm sorry, buddy. I had a bit of trouble analyzing your data just now. Could you please try again?",
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      {/* HEADER BAR */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI FinCoach</Text>
        <Text style={styles.headerSubtitle}>Online • Your Money Assistant</Text>
      </View>

      {/* CHAT MESSAGES LIST */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.messageWrapper, item.sender === 'user' ? styles.userWrapper : styles.botWrapper]}>
            <View style={[styles.messageBubble, item.sender === 'user' ? styles.userBubble : styles.botBubble]}>
              <Text style={item.sender === 'user' ? styles.userText : styles.botText}>{item.text}</Text>

              {/* DYNAMIC EXPENSE CARD (Shows up only when logging an expense) */}
              {item.extractedData && item.extractedData.amount > 0 && (
                <View style={styles.dataCard}>
                  <View style={styles.dataRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={styles.dataCardTitle}>Logged and Saved, Buddy!</Text>
                  </View>
                  <Text style={styles.dataDetails}>
                    ₱{item.extractedData.amount} • {item.extractedData.category}
                  </Text>
                  <TouchableOpacity style={styles.viewBtn} onPress={() => router.push('/transaction')}>
                    <Text style={styles.viewBtnText}>View Records</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      />

      {/* LOADING INDICATOR */}
      {isLoading && (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="small" color="#005B60" />
          <Text style={styles.loadingText}>Analyzing your finances, buddy...</Text>
        </View>
      )}

      {/* INPUT FIELD BAR */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask a question or log your expense here..."
          placeholderTextColor="#A0AEC0"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={isLoading}>
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 55 : 45,
    paddingBottom: 15,
    backgroundColor: '#005B60', 
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  backButton: { position: 'absolute', left: 15, top: Platform.OS === 'ios' ? 52 : 44, padding: 5 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: '#E2E8F0', fontSize: 11, position: 'absolute', bottom: 2 },
  chatContainer: { padding: 15, paddingBottom: 20 },
  messageWrapper: { flexDirection: 'row', marginBottom: 12, width: '100%' },
  userWrapper: { justifyContent: 'flex-end' },
  botWrapper: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: '#10B981', borderBottomRightRadius: 2 },
  botBubble: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  userText: { color: '#FFFFFF', fontSize: 15 },
  botText: { color: '#2D3748', fontSize: 15, lineHeight: 20 },
  loadingWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  loadingText: { fontSize: 13, color: '#718096', fontStyle: 'italic' },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingBottom: Platform.OS === 'ios' ? 28 : 12, 
  },
  input: { flex: 1, backgroundColor: '#F7FAFC', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 15, color: '#2D3748', maxHeight: 100 },
  sendButton: { backgroundColor: '#005B60', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  dataCard: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 10, marginTop: 10, minWidth: 180 },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dataCardTitle: { fontSize: 12, fontWeight: 'bold', color: '#10B981' },
  dataDetails: { fontSize: 14, fontWeight: '600', color: '#2D3748', marginVertical: 4 },
  viewBtn: { backgroundColor: '#005B60', borderRadius: 6, paddingVertical: 6, alignItems: 'center', marginTop: 4 },
  viewBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' }
});