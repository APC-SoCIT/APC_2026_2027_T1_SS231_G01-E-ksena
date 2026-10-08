import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { PrimaryButton } from '@/components/primary-button';
import { changePassword } from '@/lib/auth-service';
import { passwordProblems } from '@/lib/password';
import {
  Spacing,
  FontSizes,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
  OFF_WHITE,
  BORDER,
  Radius,
  CardShadow,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  SUCCESS,
  SUCCESS_BG,
} from '@/constants/theme';

export default function ProfileScreen() {
  const { user, logout, updateProfile } = useAuth();
  const theme = useRoleTheme();
  const [username, setUsername] = useState(user?.username ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(user?.username ?? '');
  }, [user?.username]);

  const handleSave = async () => {
    setSaved(false);
    if (!username.trim()) {
      setFormError('Username is required.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await updateProfile({ username: username.trim() });
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    setPwSaved(false);
    setPwError(null);
    if (!currentPassword) {
      setPwError('Enter your current password.');
      return;
    }
    const missing = passwordProblems(newPassword);
    if (missing.length > 0) {
      setPwError(`New password needs ${missing.join(', ')}.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPwError('The new password must be different from the current one.');
      return;
    }
    setChanging(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwSaved(true);
    } catch (err) {
      setPwError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not change your password.'
      );
    } finally {
      setChanging(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Account</Text>
      <View style={[styles.card, CardShadow]}>
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Role</Text>
          <Text style={[styles.value, { color: theme.primary, fontWeight: '600' }]}>{theme.displayName}</Text>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor={TEXT_SECONDARY}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email}</Text>
        </View>

        {formError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}
        {saved ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>Your account has been updated.</Text>
          </View>
        ) : null}

        <PrimaryButton title={saving ? 'Saving…' : 'Save changes'} onPress={handleSave} style={styles.saveBtn} disabled={saving} />
      </View>

      <View style={[styles.card, CardShadow]}>
        <Text style={styles.cardTitle}>Change password</Text>

        {pwError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{pwError}</Text>
          </View>
        ) : null}
        {pwSaved ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>Your password has been changed.</Text>
          </View>
        ) : null}

        <Text style={styles.pwLabel}>Current password</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Current password"
          placeholderTextColor={TEXT_SECONDARY}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.pwLabel}>New password</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          placeholderTextColor={TEXT_SECONDARY}
          secureTextEntry
          autoCapitalize="none"
        />
        <Text style={styles.pwHint}>
          At least 8 characters, with an uppercase letter, a lowercase letter, a number and a special character.
        </Text>

        <Text style={styles.pwLabel}>Confirm new password</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          placeholderTextColor={TEXT_SECONDARY}
          secureTextEntry
          autoCapitalize="none"
        />

        <PrimaryButton
          title={changing ? 'Changing…' : 'Change password'}
          onPress={handleChangePassword}
          style={styles.saveBtn}
          disabled={changing}
        />
      </View>

      <Pressable onPress={handleLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutBtnText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    backgroundColor: OFF_WHITE,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.md,
  },
  pwLabel: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.sm,
  },
  pwHint: {
    fontSize: FontSizes.xs,
    color: TEXT_SECONDARY,
    lineHeight: 16,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.subtitle,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.md,
    width: '100%',
    maxWidth: 560,
  },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    width: '100%',
    maxWidth: 560,
  },
  fieldRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    minWidth: Platform.OS === 'web' ? 120 : undefined,
  },
  value: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    flex: Platform.OS === 'web' ? 1 : undefined,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: TEXT_PRIMARY,
    backgroundColor: WHITE,
    flex: Platform.OS === 'web' ? 1 : undefined,
  },
  saveBtn: {
    marginTop: Spacing.sm,
  },
  errorBox: {
    backgroundColor: DANGER_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: DANGER_BORDER,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: DANGER,
  },
  successBox: {
    backgroundColor: SUCCESS_BG,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: SUCCESS,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  successText: {
    fontSize: FontSizes.sm,
    color: SUCCESS,
  },
  logoutBtn: {
    width: '100%',
    maxWidth: 560,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  logoutBtnText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
});