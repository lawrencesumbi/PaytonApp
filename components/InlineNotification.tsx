import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { InlineNotificationData } from '../lib/useInlineNotification';

interface InlineNotificationProps {
  notification: InlineNotificationData;
  onDismiss?: () => void;
}

const ICONS: Record<InlineNotificationData['type'], { name: string; border: string; bg: string; text: string }> = {
  success: { name: 'checkmark-circle', border: '#D1FAE5', bg: '#ECFDF5', text: '#065F46' },
  error: { name: 'alert-circle', border: '#FEE2E2', bg: '#FEE2E2', text: '#B91C1C' },
  info: { name: 'information-circle', border: '#DBEAFE', bg: '#EFF6FF', text: '#1D4ED8' },
};

export default function InlineNotification({ notification, onDismiss }: InlineNotificationProps) {
  const stylesData = ICONS[notification.type];

  return (
    <View style={[styles.container, { backgroundColor: stylesData.bg, borderColor: stylesData.border }]}> 
      <View style={styles.iconWrapper}>
        <Ionicons name={stylesData.name} size={22} color={stylesData.text} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: stylesData.text }]}>{notification.title}</Text>
        <Text style={[styles.message, { color: stylesData.text }]}>{notification.message}</Text>
      </View>
      {onDismiss ? (
        <TouchableOpacity style={styles.closeButton} onPress={onDismiss}>
          <Ionicons name="close" size={18} color={stylesData.text} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: 16,
  },
  iconWrapper: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    padding: 6,
    marginLeft: 8,
  },
});
