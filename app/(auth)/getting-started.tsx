// app/(auth)/getting-started.tsx
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Dimensions,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Platform,
  ImageBackground
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const DESIGN_COLORS = {
  brandGreen: '#166534', 
  textDark: '#0F172A',      
  textMuted: '#64748B',      
  borderLight: '#E2E8F0',
  lightGrayBg: '#F8FAFC'    
};

const ONBOARDING_STEPS = [
  {
    id: 'track',
    title: 'Track Expense',
    description: '"Watch your leaks, or small expenses will sink a large ship." — Payton App Analytics.',
  },
  {
    id: 'reminders',
    title: 'Smart Reminders',
    description: '"An organized wallet leads to a peaceful mind." — Stay ahead of your upcoming obligations.',
  },
  {
    id: 'splitting',
    title: 'Bill Splitting',
    description: '"Clear accounts make long friendships." — Divide shared expenses fairly and instantly.',
  },
  {
    id: 'get-started',
    title: "Let's Get Started!",
    description: 'With Payton, sending, receiving, and managing your money is easier than ever before.',
  }
];

export default function GettingStartedScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleRedirectToLogin = async () => {
    try {
      await AsyncStorage.setItem('has_visited_before', 'true');
      router.push('/login'); 
    } catch (error) {
      router.push('/login'); 
    }
  };

  const step = ONBOARDING_STEPS[currentStep];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 1. TOP BACKGROUND CANVAS */}
      <ImageBackground
        source={require('../../assets/images/cover-bg.png')}
        style={styles.topBackground}
      >
        <SafeAreaView style={{ flex: 1 }} />
      </ImageBackground>

      {/* 2. BOTTOM CARD WRAPPER */}
      <View style={styles.bottomCardWrapper}>
        <View style={styles.waveCurve} />

        <View style={styles.bottomCardContent}>
          <ScrollView 
            contentContainerStyle={styles.scrollContainer} 
            bounces={false}
            scrollEnabled={false} 
            showsVerticalScrollIndicator={false}
          >
            {/* FIX 1: Gihimo na natong 0 ang static spacer height aron dili moduso paubos */}
            <View style={styles.layoutPhoneSpacer} />

            {/* Message Block */}
            <View style={styles.textContainer}>
              <Text style={styles.heading}>{step.title}</Text>
              <Text style={styles.description}>{step.description}</Text>
            </View>
          </ScrollView>

          {/* Progress Stepper Bullets */}
          <View style={styles.indicatorContainer}>
            {ONBOARDING_STEPS.map((_, index) => (
              <View 
                key={index} 
                style={[
                  styles.dot, 
                  currentStep === index ? styles.activeDot : styles.inactiveDot
                ]} 
              />
            ))}
          </View>

          {/* NAVIGATION ACTIONS */}
          <View style={styles.embeddedNavigationContainer}>
            {step.id === 'get-started' ? (
              <TouchableOpacity style={styles.primaryButtonFull} onPress={handleRedirectToLogin}>
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.navigationRow}>
                {currentStep === 0 ? (
                  <TouchableOpacity style={styles.secondaryButtonHalf} onPress={handleRedirectToLogin}>
                    <Text style={styles.secondaryButtonText}>Skip</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.secondaryButtonHalf} onPress={handleBack}>
                    <Text style={styles.secondaryButtonText}>Back</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.primaryButtonHalf} onPress={handleNext}>
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* 3. EXTRA TALL PORTRAIT PHONE CANVAS */}
      <View style={styles.absolutePhoneWrapper} pointerEvents="none">
        <View style={styles.mockupPhoneFrame}>
          
          {/* PHONE HARDWARE TOP BEZEL / DYNAMIC ISLAND */}
          <View style={styles.hardwareHeader}>
            <Text style={styles.hardwareTime}>9:41</Text>
            <View style={styles.dynamicIsland} />
            <View style={styles.hardwareIcons}>
              <Text style={styles.hardwareIconText}>📶 🔋</Text>
            </View>
          </View>

          {/* APP INNER HEADER */}
          <View style={styles.appHeaderRow}>
            <Text style={styles.appHeaderTitle}>Payton Analytics</Text>
            <Text style={styles.appHeaderIcon}>🔔</Text>
          </View>
          
          {/* STEP 1: TRACK EXPENSE DETAIL SCREEN */}
          {step.id === 'track' && (
            <View style={styles.mockupInnerContent}>
              <View style={styles.balanceCard}>
                <Text style={styles.cardLabel}>Available Balance</Text>
                <Text style={styles.cardValue}>₱48,250.00</Text>
              </View>
              
              <Text style={styles.sectionSubtitle}>Monthly Insights</Text>
              <View style={styles.mockupChartRow}>
                <View style={styles.chartBarContainer}>
                  <View style={[styles.chartBar, { height: 60, backgroundColor: DESIGN_COLORS.brandGreen }]} />
                  <Text style={styles.chartBarLabel}>W1</Text>
                </View>
                <View style={styles.chartBarContainer}>
                  <View style={[styles.chartBar, { height: 110, backgroundColor: DESIGN_COLORS.brandGreen }]} />
                  <Text style={styles.chartBarLabel}>W2</Text>
                </View>
                <View style={styles.chartBarContainer}>
                  <View style={[styles.chartBar, { height: 80, backgroundColor: DESIGN_COLORS.brandGreen }]} />
                  <Text style={styles.chartBarLabel}>W3</Text>
                </View>
                <View style={styles.chartBarContainer}>
                  <View style={[styles.chartBar, { height: 140, backgroundColor: DESIGN_COLORS.brandGreen }]} />
                  <Text style={styles.chartBarLabel}>W4</Text>
                </View>
              </View>
            </View>
          )}

          {/* STEP 2: SMART REMINDERS DETAIL SCREEN */}
          {step.id === 'reminders' && (
            <View style={styles.mockupInnerContent}>
              <Text style={styles.sectionSubtitle}>Upcoming Obligations</Text>
              
              <View style={styles.reminderItemBox}>
                <View style={styles.reminderIconWrapper}>
                  <Text style={{ fontSize: 16 }}>⚡</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.detailItemTitle}>Electricity Bill</Text>
                  <Text style={styles.detailItemSub}>Due in 2 days</Text>
                </View>
                <Text style={styles.detailItemAmount}>₱3,500</Text>
              </View>

              <View style={styles.reminderItemBox}>
                <View style={[styles.reminderIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                  <Text style={{ fontSize: 16 }}>🌐</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.detailItemTitle}>Internet Subscription</Text>
                  <Text style={styles.detailItemSub}>Due tomorrow</Text>
                </View>
                <Text style={styles.detailItemAmount}>₱1,299</Text>
              </View>

              <View style={styles.reminderItemBox}>
                <View style={[styles.reminderIconWrapper, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={{ fontSize: 16 }}>🏠</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.detailItemTitle}>House Rental Fee</Text>
                  <Text style={styles.detailItemSub}>Due in 5 days</Text>
                </View>
                <Text style={styles.detailItemAmount}>₱8,500</Text>
              </View>
            </View>
          )}

          {/* STEP 3: BILL SPLITTING DETAIL SCREEN */}
          {step.id === 'splitting' && (
            <View style={styles.mockupInnerContent}>
              <View style={styles.splitTotalHeader}>
                <Text style={styles.cardLabel}>Total Shared Bill</Text>
                <Text style={{ color: DESIGN_COLORS.textDark, fontSize: 18, fontWeight: '700' }}>₱1,500.00</Text>
              </View>
              
              <Text style={styles.sectionSubtitle}>Group Split Breakdown</Text>
              <View style={styles.splitRow}>
                <Text style={styles.darkText}>👤 You owe</Text>
                <Text style={styles.greenText}>₱500.00</Text>
              </View>
              <View style={styles.splitRow}>
                <Text style={styles.darkText}>👤 Lawrence owes</Text>
                <Text style={styles.greenText}>₱500.00</Text>
              </View>
              <View style={styles.splitRow}>
                <Text style={styles.darkText}>👤 Alex owes</Text>
                <Text style={styles.greenText}>₱500.00</Text>
              </View>
            </View>
          )}

          {/* STEP 4: GET STARTED SCREEN DETAIL */}
          {step.id === 'get-started' && (
            <View style={[styles.mockupInnerContent, { justifyContent: 'center', alignItems: 'center', paddingTop: 20 }]}>
              <View style={[styles.iconCircle, { backgroundColor: DESIGN_COLORS.brandGreen, width: 72, height: 72, borderRadius: 36 }]}>
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 32 }}>🚀</Text>
              </View>
              <Text style={[styles.cardValueText, { marginTop: 14, fontSize: 18 }]}>Account Secured</Text>
              <Text style={[styles.cardSubText, { textAlign: 'center', paddingHorizontal: 12, lineHeight: 18, marginTop: 4 }]}>
                Your local financial ecosystem is completely configured and ready to roll.
              </Text>
            </View>
          )}

          {/* BOTTOM HOME INDICATOR BAR */}
          <View style={styles.hardwareHomeIndicator} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF',
  },
  topBackground: {
    height: height * 0.58, 
    backgroundColor: '#166534',
  },
  bottomCardWrapper: {
    height: height * 0.42, 
    backgroundColor: '#FFFFFF',
  },
  waveCurve: {
    position: 'absolute',
    top: -44,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: width * 0.5,
    borderTopRightRadius: width * 0.5,
    transform: [{ scaleX: 1.3 }],
  },
  bottomCardContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    justifyContent: 'space-between',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end', // FIX 2: Gi-force nato pa-itaas ang flex elements aron mo-dock dapit sa hardware bounds
  },
  layoutPhoneSpacer: {
    height: 0, // FIX 3: Gi-tangtang na gyud ang spacer height aron mawala ang gap sa tunga
    width: '100%',
  },
  absolutePhoneWrapper: {
    position: 'absolute',
    top: (height * 0.58) - 330, 
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  mockupPhoneFrame: {
    width: width * 0.74, 
    height: 425, 
    backgroundColor: '#FFFFFF',
    borderRadius: 36, 
    borderWidth: 8, 
    borderColor: '#1E293B', 
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: {
        elevation: 14,
      },
    }),
  },
  
  hardwareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    height: 18,
    marginBottom: 4,
  },
  hardwareTime: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0F172A',
    width: 30,
  },
  dynamicIsland: {
    width: 64,
    height: 12,
    backgroundColor: '#000000',
    borderRadius: 6,
  },
  hardwareIcons: {
    width: 30,
    alignItems: 'flex-end',
  },
  hardwareIconText: {
    fontSize: 8,
  },

  appHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
  },
  appHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  appHeaderIcon: {
    fontSize: 11,
  },
  mockupInnerContent: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  
  balanceCard: {
    backgroundColor: '#F0FDF4',
    padding: 8,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  mockupChartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 145, 
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
  },
  chartBarContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: 14,
    borderRadius: 4,
  },
  chartBarLabel: {
    fontSize: 8,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '500',
  },
  reminderItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reminderIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailItemTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0F172A',
  },
  detailItemSub: {
    fontSize: 8,
    color: '#64748B',
  },
  detailItemAmount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  splitTotalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },

  cardLabel: {
    color: DESIGN_COLORS.textMuted,
    fontSize: 9,
  },
  cardValue: {
    color: DESIGN_COLORS.textDark,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  iconCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardValueText: {
    color: DESIGN_COLORS.textDark,
    fontWeight: '700',
  },
  cardSubText: {
    color: DESIGN_COLORS.textMuted,
    fontSize: 11,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  darkText: { color: DESIGN_COLORS.textDark, fontSize: 10, fontWeight: '500' },
  greenText: { color: DESIGN_COLORS.brandGreen, fontSize: 10, fontWeight: '700' },
  
  hardwareHomeIndicator: {
    width: 80,
    height: 4,
    backgroundColor: '#000000',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
  },

  textContainer: { 
    width: '100%', 
    alignItems: 'center',
    // FIX 4: Gi-lock nato ang top container distance ngadto sa eksaktong 105px aron pilit kaayo sa mockup border
    marginTop: 105, 
    marginBottom: 10,
  },
  heading: { 
    color: DESIGN_COLORS.textDark, 
    fontSize: 22, 
    fontWeight: '800', 
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  description: {
    color: DESIGN_COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 20,
    backgroundColor: DESIGN_COLORS.textDark,
  },
  inactiveDot: {
    width: 6,
    backgroundColor: DESIGN_COLORS.borderLight,
  },
  embeddedNavigationContainer: {
    width: '100%',
    alignItems: 'center',
  },
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', 
    width: '100%',
    gap: 12,
  },
  
  secondaryButtonHalf: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: DESIGN_COLORS.borderLight,
    height: 48, 
    borderRadius: 24, 
    flexDirection: 'row',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: DESIGN_COLORS.textDark,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButtonHalf: {
    flex: 1,
    backgroundColor: DESIGN_COLORS.brandGreen, 
    height: 48, 
    borderRadius: 24, 
    flexDirection: 'row',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  primaryButtonFull: {
    width: '100%',
    backgroundColor: DESIGN_COLORS.brandGreen, 
    height: 50, 
    borderRadius: 25, 
    flexDirection: 'row',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  primaryButtonText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '600',
    textAlign: 'center',
  }
});