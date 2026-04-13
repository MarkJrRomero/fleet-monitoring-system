import { useState } from 'react';
import { KeyboardAvoidingView, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

const GENERIC_LOGIN_ERROR = 'No fue posible iniciar sesion. Intenta nuevamente.';

function sanitizeLoginError(error: unknown): string {
  if (!(error instanceof Error)) {
    return GENERIC_LOGIN_ERROR;
  }

  const normalized = error.message.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return GENERIC_LOGIN_ERROR;
  }

  if (normalized.length > 140) {
    return GENERIC_LOGIN_ERROR;
  }

  return normalized;
}

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('driver_test');
  const [password, setPassword] = useState('driver123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    setLoading(true);
    setError('');

    if (!username.trim() || !password.trim()) {
      setLoading(false);
      setError('Ingresa tu usuario y contrasena para continuar.');
      return;
    }

    try {
      await signIn(username, password);
    } catch (err) {
      console.error('[LoginScreen] Error al iniciar sesion', err);
      setError(sanitizeLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[colors.surface, '#e7f5ff', '#dff7f3']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.card}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} />
          <Text style={styles.badge}>SMTF MOVIL</Text>
          <Text style={styles.title}>Acceso movil operativo</Text>
          <Text style={styles.subtitle}>Conductores ven su cabina. Administradores ven la flota completa en modo dashboard.</Text>

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsername}
            placeholder="Correo o username"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={username}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="Contrasena"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              value={password}
            />
            <Pressable
              accessibilityLabel={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.eyeButton}
            >
              <Ionicons color={colors.textMuted} name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}


          <Pressable disabled={loading} onPress={onSubmit} style={[styles.button, loading && styles.buttonDisabled]}>
            <Text style={styles.buttonText}>{loading ? 'Validando...' : 'Iniciar sesion'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 28,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 22,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 10,
    borderRadius: 16
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#cdeff0',
    color: colors.primaryDark,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    fontWeight: '700',
    marginBottom: 10
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 18,
    fontSize: 13
  },
  input: {
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f8fbff',
    paddingHorizontal: 16,
    marginBottom: 12,
    color: colors.text,
    fontWeight: '600'
  },
  passwordWrap: {
    position: 'relative',
    marginBottom: 12
  },
  passwordInput: {
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f8fbff',
    paddingLeft: 16,
    paddingRight: 48,
    color: colors.text,
    fontWeight: '600'
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 10,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center'
  },
  button: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.2
  },
  error: {
    color: colors.danger,
    fontWeight: '600',
    marginBottom: 8
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 10
  }
});
