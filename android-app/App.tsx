import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import {
  AuthScreen,
  ChatScreen,
  DashboardScreen,
  ImageStudioScreen,
  MusicVoiceScreen,
  VideoStudioScreen,
} from './src/screens/StudioScreens';

function MainNavigator() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#8B5CF6" size="large" />
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI STUDIO</Text>
        <Text style={styles.headerCredits}>{user.credits.total} cr</Text>
      </View>

      <View style={styles.body}>
        {tab === 'dashboard' && <DashboardScreen onOpenTab={setTab} />}
        {tab === 'chat' && <ChatScreen />}
        {tab === 'image' && <ImageStudioScreen />}
        {tab === 'video' && <VideoStudioScreen />}
        {tab === 'music' && <MusicVoiceScreen />}
      </View>

      <View style={styles.tabBar}>
        {[
          { id: 'dashboard', label: 'Home' },
          { id: 'chat', label: 'Chat' },
          { id: 'image', label: 'Image' },
          { id: 'video', label: 'Video' },
          { id: 'music', label: 'Music' },
        ].map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.tabBtn}
            onPress={() => setTab(item.id)}
          >
            <Text style={[styles.tabLabel, tab === item.id && styles.tabLabelActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <MainNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07050C' },
  center: { flex: 1, backgroundColor: '#07050C', justifyContent: 'center', alignItems: 'center' },
  header: {
    height: 54,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#241A3D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  headerCredits: { color: '#C4B5FD', fontSize: 13, fontWeight: '600' },
  body: { flex: 1 },
  tabBar: {
    height: 58,
    backgroundColor: '#0A0712',
    borderTopWidth: 1,
    borderTopColor: '#241A3D',
    flexDirection: 'row',
  },
  tabBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { color: '#8A7FA8', fontSize: 12, fontWeight: '500' },
  tabLabelActive: { color: '#A78BFA', fontWeight: '700' },
});
