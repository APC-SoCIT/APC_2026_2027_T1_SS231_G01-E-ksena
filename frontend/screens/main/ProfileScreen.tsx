import { Calendar, Edit3, LogOut, Mail, Phone, User } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

const ProfileScreen: React.FC = () => {
  const { state, logout } = useAuth();
  const { user } = state.auth;

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            logout();
          },
        },
      ]
    );
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleEditProfile = () => {
    setIsEditing(true);
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { supabase } = await import('../../services/supabaseClient');
      const { error } = await supabase
        .from('users')
        .update({ 
          full_name: editName,
          user_phone_number: editPhone 
        })
        .eq('email', user.email);

      if (error) throw error;
      
      // Update local state (this is a bit hacky without a proper context update, 
      // but it works for immediately reflecting the change on the screen)
      user.name = editName;
      user.phone = editPhone;
      
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Failed to update profile: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>User data not available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <User size={60} color="#dc2626" />
          </View>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>

        <View style={styles.detailsContainer}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <User size={20} color="#6b7280" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Full Name</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter your full name"
                />
              ) : (
                <Text style={styles.detailValue}>{user.name}</Text>
              )}
            </View>
          </View>

          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <Mail size={20} color="#6b7280" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Email Address</Text>
              <Text style={styles.detailValue}>{user.email} (Uneditable)</Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <Phone size={20} color="#6b7280" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Phone Number</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="Enter your phone number"
                  keyboardType="phone-pad"
                />
              ) : (
                <Text style={styles.detailValue}>{user.phone || 'Not provided'}</Text>
              )}
            </View>
          </View>

          {user.dateOfBirth && (
            <View style={styles.detailItem}>
              <View style={styles.detailIcon}>
                <Calendar size={20} color="#6b7280" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Date of Birth</Text>
                <Text style={styles.detailValue}>{user.dateOfBirth}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.actionsContainer}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          
          {isEditing ? (
            <>
              <TouchableOpacity style={styles.actionButton} onPress={saveProfile} disabled={isSaving}>
                <View style={styles.actionIcon}>
                  <Edit3 size={20} color="#059669" />
                </View>
                <Text style={[styles.actionText, { color: '#059669' }]}>
                  {isSaving ? 'Saving...' : 'Save Profile'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => setIsEditing(false)}>
                <View style={styles.actionIcon}>
                  <LogOut size={20} color="#6b7280" />
                </View>
                <Text style={[styles.actionText, { color: '#6b7280' }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.actionButton} onPress={handleEditProfile}>
              <View style={styles.actionIcon}>
                <Edit3 size={20} color="#dc2626" />
              </View>
              <Text style={styles.actionText}>Edit Profile</Text>
            </TouchableOpacity>
          )}

          {!isEditing && (
            <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout}>
              <View style={styles.actionIcon}>
                <LogOut size={20} color="#dc2626" />
              </View>
              <Text style={styles.actionText}>Logout</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>E-KSENA Emergency Response</Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#6b7280',
  },
  detailsContainer: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailIcon: {
    width: 40,
    alignItems: 'center',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  input: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
    borderBottomWidth: 1,
    borderBottomColor: '#dc2626',
    paddingVertical: 4,
    marginTop: -4,
  },
  actionsContainer: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  actionIcon: {
    width: 40,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  logoutButton: {
    borderBottomWidth: 0,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});

export default ProfileScreen;



