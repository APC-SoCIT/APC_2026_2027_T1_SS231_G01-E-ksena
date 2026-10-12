import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CheckSquare, Lock, Mail, Shield, Square } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { AuthStackParamList } from '../../navigation/AuthStack';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { requestOtp, verifyOtp, state, clearError } = useAuth();
  
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSendOtp = async () => {
    if (!acceptedTerms) {
      Alert.alert(
        'Consent Required',
        'Under the Data Privacy Act, you must review and agree to the Terms and Conditions and Privacy Policy before proceeding.',
        [
          { text: 'Terms', onPress: () => navigation.navigate('Terms') },
          { text: 'Privacy', onPress: () => navigation.navigate('Privacy') },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      await requestOtp(email.trim());
      setStep('otp');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!acceptedTerms) {
      Alert.alert(
        'Consent Required',
        'You must review and agree to the Terms and Conditions and Privacy Policy before logging in.'
      );
      return;
    }

    if (!otpCode.trim() || otpCode.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      await verifyOtp(email.trim(), otpCode.trim());
      // Navigation handled by AuthContext state change automatically
    } catch (error) {
      Alert.alert('Verification Failed', error instanceof Error ? error.message : 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Shield size={60} color="#dc2626" />
            </View>
            <Text style={styles.title}>E-KSENA</Text>
            <Text style={styles.subtitle}>Emergency Response System</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Mail size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#9ca3af"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
                <TouchableOpacity 
                  onPress={handleSendOtp} 
                  disabled={isLoading || !email.trim() || !acceptedTerms}
                  style={[styles.sendCodeBtn, (!acceptedTerms || !email.trim()) && styles.sendCodeBtnDisabled]}
                >
                  <Text style={styles.sendCodeText}>
                    {isLoading && step === 'email' ? 'Sending...' : 'Send code'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Lock size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="OTP"
                  placeholderTextColor="#9ca3af"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>

            {/* Terms and Privacy Consent Checkbox */}
            <View style={styles.consentContainer}>
              <TouchableOpacity 
                style={styles.checkboxTouchable} 
                onPress={() => setAcceptedTerms(!acceptedTerms)}
                hitSlop={8}
                activeOpacity={0.7}
              >
                {acceptedTerms ? (
                  <CheckSquare size={20} color="#dc2626" />
                ) : (
                  <Square size={20} color="#9ca3af" />
                )}
              </TouchableOpacity>
              <Text style={styles.consentText}>
                I have read and agree to the{' '}
                <Text style={styles.legalLink} onPress={() => navigation.navigate('Terms')}>
                  Terms & Conditions
                </Text>
                {' '}and{' '}
                <Text style={styles.legalLink} onPress={() => navigation.navigate('Privacy')}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.loginButton, (isLoading || !otpCode.trim() || !acceptedTerms) && styles.loginButtonDisabled]}
              onPress={handleVerifyOtp}
              disabled={isLoading || !otpCode.trim() || !acceptedTerms}
            >
              <Text style={styles.loginButtonText}>
                {isLoading && step === 'otp' ? 'Verifying...' : 'Login'}
              </Text>
            </TouchableOpacity>
            
            {step === 'otp' && !state.auth.error && (
              <Text style={styles.successText}>Code sent! Please check your email.</Text>
            )}

            {state.auth.error && (
              <Text style={styles.errorText}>{state.auth.error}</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#111827',
  },
  loginButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    backgroundColor: '#fca5a5',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
  },
  infoText: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 14,
    color: '#374151',
  },
  linkText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  sendCodeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    marginLeft: 8,
  },
  sendCodeText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  sendCodeBtnDisabled: {
    opacity: 0.5,
  },
  consentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 14,
    paddingHorizontal: 2,
    gap: 10,
  },
  checkboxTouchable: {
    paddingTop: 2,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#4b5563',
  },
  legalLink: {
    color: '#dc2626',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  successText: {
    color: '#16a34a',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 15,
  },
});

export default LoginScreen;
