import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { useAuth } from '@/context/auth';
import { useRoleTheme } from '@/context/role-theme';
import { PrimaryButton } from '@/components/primary-button';
import { PhoneInput, toE164, fromE164, isValidPhone } from '@/components/phone-input';
import { MaterialIcons } from '@expo/vector-icons';
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
  const { user, logout, updateProfile, isAdminOnly, accountEmail } = useAuth();
  const theme = useRoleTheme();
  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(fromE164(user?.phone));
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(user?.username ?? '');
    setFullName(user?.fullName ?? '');
    setPhone(fromE164(user?.phone));
  }, [user?.username, user?.fullName, user?.phone]);

  const handleSave = async () => {
    setSaved(false);
    if (!username.trim()) {
      setFormError('Username is required.');
      return;
    }
    if (!fullName.trim()) {
      setFormError('Full name is required.');
      return;
    }
    if (!isValidPhone(phone)) {
      setFormError('Enter a valid contact number.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await updateProfile({
        username: username.trim(),
        fullName: fullName.trim(),
        phone: toE164(phone),
      });
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch (err) {
      const detail =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
      setLogoutError(
        detail ? `Could not log out: ${detail}` : 'Could not log out. Check your connection and try again.'
      );
    }
  };

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwNote, setPwNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  // Changing the password asks for the current one first, so an unlocked
  // browser left open is not enough to take the account over.
  const handleChangePassword = async () => {
    setPwNote(null);
    if (!currentPw || !newPw || !confirmPw) {
      setPwNote({ ok: false, text: 'Fill in your current password and the new password twice.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwNote({ ok: false, text: 'The new passwords do not match.' });
      return;
    }
    const problems = passwordProblems(newPw);
    if (problems.length) {
      setPwNote({ ok: false, text: `The new password needs ${problems.join(', ')}.` });
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwNote({ ok: true, text: 'Your password has been changed.' });
    } catch (err) {
      setPwNote({ ok: false, text: err instanceof Error ? err.message : 'Could not change the password.' });
    } finally {
      setPwSaving(false);
    }
  };

  const passwordSection = (
    <View style={[styles.card, CardShadow]}>
      {/* Folded away until asked for: changing a password is rare, and the
          fields should not sit open on every visit to Profile. */}
      <Pressable
        onPress={() => {
          setPwOpen((open) => !open);
          setPwNote(null);
        }}
        style={styles.dropHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: pwOpen }}
        accessibilityLabel="Change password"
      >
        <Text style={[styles.sectionTitle, styles.dropTitle]}>Change password</Text>
        <MaterialIcons name={pwOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={26} color={TEXT_SECONDARY} />
      </Pressable>
      {pwOpen ? (
      <View style={styles.dropBody}>
      {(
        [
          ['Current password', currentPw, setCurrentPw],
          ['New password', newPw, setNewPw],
          ['Confirm new password', confirmPw, setConfirmPw],
        ] as const
      ).map(([label, value, setValue]) => (
        <View key={label} style={styles.fieldRow}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={label}
            placeholderTextColor={TEXT_SECONDARY}
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel={label}
          />
        </View>
      ))}
      {pwNote ? (
        <View style={pwNote.ok ? styles.successBox : styles.errorBox}>
          <Text style={pwNote.ok ? styles.successText : styles.errorText}>{pwNote.text}</Text>
        </View>
      ) : null}
      <PrimaryButton
        title={pwSaving ? 'Changing…' : 'Change password'}
        onPress={handleChangePassword}
        style={styles.saveBtn}
        disabled={pwSaving}
      />
      </View>
      ) : null}
    </View>
  );

  const logoutSection = (
    <>
      {logoutError ? (
        <View style={[styles.errorBox, styles.logoutError]}>
          <Text style={styles.errorText}>{logoutError}</Text>
        </View>
      ) : null}

      <Pressable onPress={handleLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutBtnText}>Log out</Text>
      </Pressable>
    </>
  );

  // An admin with no service has no responder profile to fill in. The name,
  // username and number on the form below are what dispatch shows for a
  // responder, and saving them is what files an account in the directory.
  if (isAdminOnly) {
    return (
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Account</Text>
        <View style={[styles.card, CardShadow]}>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Role</Text>
            <Text style={[styles.value, { color: theme.primary, fontWeight: '600' }]}>{theme.displayName}</Text>
          </View>
          <View style={[styles.fieldRow, styles.lastFieldRow]}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{accountEmail}</Text>
          </View>
        </View>
        {passwordSection}
      {logoutSection}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Account</Text>
      <View style={[styles.card, CardShadow]}>
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Role</Text>
          <Text style={[styles.value, { color: theme.primary, fontWeight: '600' }]}>{theme.displayName}</Text>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name"
            placeholderTextColor={TEXT_SECONDARY}
          />
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

        <View style={styles.fieldRow}>
          <Text style={styles.label}>Contact number</Text>
          <View style={styles.phoneSlot}>
            <PhoneInput value={phone} onChange={setPhone} />
          </View>
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

      {passwordSection}
      {logoutSection}
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
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: Spacing.md,
  },
  dropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropTitle: {
    marginBottom: 0,
  },
  dropBody: {
    marginTop: Spacing.md,
  },
  lastFieldRow: {
    marginBottom: 0,
  },
  label: {
    fontSize: FontSizes.sm,
    color: TEXT_SECONDARY,
    // A fixed width, so every field starts at the same place however long
    // its label is ("Confirm new password" pushed its box out of line).
    width: Platform.OS === 'web' ? 150 : undefined,
  },
  value: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    flex: Platform.OS === 'web' ? 1 : undefined,
  },
  phoneSlot: {
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
  logoutError: {
    width: '100%',
    maxWidth: 560,
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