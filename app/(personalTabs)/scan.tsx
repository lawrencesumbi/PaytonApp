// app/(spenderTabs)/scan.tsx
import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router'; // 1. Added Stack import
import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export default function ScanReceiptScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const cameraRef = useRef<any>(null);

  // Evaluate & Request Active Device Camera Permissions
  if (!permission) {
    return (
      <SafeAreaView style={[styles.fallbackContainer, styles.centerAlign]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#0E2417" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.fallbackContainer, styles.centerAlign, { paddingHorizontal: 32 }]}>
        <StatusBar style="dark" />
        <View style={styles.permissionIconCircle}>
          <Ionicons name="camera-outline" size={32} color="#475569" />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionDescription}>
          To automatically scan and process transaction receipts with Payton, please grant camera permissions in your system choices.
        </Text>
        <TouchableOpacity style={styles.grantPermissionBtn} onPress={requestPermission}>
          <Text style={styles.grantPermissionBtnText}>Allow Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const toggleFlash = () => {
    setTorchOn((prev) => !prev);
    setFlash((current) => (current === 'off' ? 'on' : 'off'));
  };

  const handleTakePicture = async () => {
    if (cameraRef.current && !scanning) {
      try {
        setScanning(true);
        
        const options = { quality: 0.5, base64: true, skipProcessing: false };
        const photo = await cameraRef.current.takePictureAsync(options);

        if (!photo.base64) {
          throw new Error("Unable to read valid image binary base64 data stream.");
        }

        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.5-flash",
          generationConfig: {
            responseMimeType: "application/json",
          }
        });

        const prompt = `
          Analyze this receipt image. Extract structural merchant properties and transaction balances.
          If data is missing or unreadable, perform a logical fallback assumption.
          
          Return a strict raw JSON matching this format:
          {
            "name": "string (Name of the merchant / store / establishment, max 25 characters)",
            "amount": number (The total transaction value or total balance due as a numeric float value, do not include currency symbols)"
          }
        `;

        const imagePart = {
          inlineData: {
            data: photo.base64,
            mimeType: "image/jpeg"
          },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        
        const cleanJsonText = responseText.replace(/```json|```/g, '').trim();
        const extractedInfo = JSON.parse(cleanJsonText);

        Alert.alert(
          "Scan Complete 🎉",
          `Merchant: ${extractedInfo.name || 'Scanned Receipt'}\nAmount: ₱${Number(extractedInfo.amount || 0).toFixed(2)}`,
          [
            {
              text: "Populate Form",
              onPress: () => {
                router.push({
                  pathname: '/budget', 
                  params: { 
                    scannedName: extractedInfo.name || 'Scanned Receipt', 
                    scannedAmount: (extractedInfo.amount || 0).toString() 
                  }
                });
              }
            },
            { text: "Try Again", style: "cancel" }
          ]
        );

      } catch (error: any) {
        console.error("Gemini Scan Error:", error);
        Alert.alert(
          "Scan Failed ❌", 
          "Gemini could not read or structuralize the text nodes accurately. Make sure the receipt matches the green framing borders."
        );
      } finally {
        setScanning(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* 2. DYNAMICALLY HIDES THE BOTTOM TABS BAR */}
      <Stack.Screen 
        options={{
          headerShown: false,
          tabBarVisible: false, // Legacy fallback option
          tabBarStyle: { display: 'none' } // Hides tab menu dock natively in modern Expo layouts
        }} 
      />

      <StatusBar style="light" />
      
      <CameraView 
        style={styles.camera} 
        ref={cameraRef} 
        flash={flash}
        enableTorch={torchOn}
      >
        <View style={styles.overlayContainer}>
          <View style={styles.topUtilityRow}>
            <TouchableOpacity 
              style={styles.utilityRoundButton} 
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.instructionText}>Align receipt within frame</Text>

            <TouchableOpacity 
              style={[styles.utilityRoundButton, torchOn && styles.utilityButtonActive]} 
              onPress={toggleFlash}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={torchOn ? "flash" : "flash-off-outline"} 
                size={20} 
                color={torchOn ? "#10B981" : "#FFFFFF"} 
              />
            </TouchableOpacity>
          </View>

          <View style={styles.scanTargetBox} />

          <View style={styles.safeBottomHeaderSpacer}>
            <Text style={styles.subInstructionText}>Ensure text is bright, legible, and clear</Text>
          </View>
        </View>

        <View style={styles.actionControlContainer}>
          {scanning ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.loadingText}>Analyzing receipt nodes...</Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.outerCaptureRing} 
              onPress={handleTakePicture}
              activeOpacity={0.8}
            >
              <View style={styles.innerCaptureSolid} />
            </TouchableOpacity>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  fallbackContainer: { flex: 1, backgroundColor: '#FAFBFD' },
  centerAlign: { justifyContent: 'center', alignItems: 'center' },
  camera: { flex: 1 },
  topUtilityRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 20 : 40) : 60, 
  },
  utilityRoundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.7)', 
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  utilityButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981'
  },
  overlayContainer: { 
    flex: 1, 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: 'rgba(15, 23, 42, 0.45)', 
    paddingHorizontal: 20 
  },
  instructionText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '600', 
    textAlign: 'center',
    letterSpacing: -0.3,
    flex: 1,
    marginHorizontal: 10
  },
  scanTargetBox: { 
    width: width * 0.78, 
    height: width * 1.15, 
    borderWidth: 2, 
    borderColor: '#10B981', 
    borderRadius: 24, 
    backgroundColor: 'transparent' 
  },
  safeBottomHeaderSpacer: { marginBottom: 175 },
  subInstructionText: { 
    color: '#94A3B8', 
    fontSize: 13, 
    textAlign: 'center', 
    fontWeight: '500' 
  },
  actionControlContainer: { 
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)', 
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  outerCaptureRing: { 
    width: 76, 
    height: 76, 
    borderRadius: 38, 
    borderWidth: 4, 
    borderColor: '#FFFFFF', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  innerCaptureSolid: { 
    width: 56, 
    height: 56, 
    borderRadius: 28, 
    backgroundColor: '#10B981' 
  },
  loadingBlock: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: -0.1 },
  permissionIconCircle: { 
    width: 64, 
    height: 64, 
    borderRadius: 20, 
    backgroundColor: '#F1F5F9', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', textAlign: 'center', letterSpacing: -0.4 },
  permissionDescription: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 22, fontWeight: '400' },
  grantPermissionBtn: { backgroundColor: '#1E293B', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16, marginTop: 28 },
  grantPermissionBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 }
});