import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

type DriverStackParamList = {
  DriverProfile: undefined;
};

type DriverNavigation = NativeStackNavigationProp<DriverStackParamList, 'DriverProfile'>;

export function DriverProfileScreen() {
  const { session, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<DriverNavigation>();

  const rolesLabel = Array.isArray(session?.roles) && session?.roles.length > 0
    ? session.roles.join(', ')
    : 'conductor';

  const expiryLabel = session?.expiresAt
    ? new Date(session.expiresAt).toLocaleString('es-CO')
    : 'No disponible';

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}> 
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons color={colors.text} name="arrow-back" size={18} />
        </Pressable>
        <Text style={styles.headerTitle}>Perfil</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <GlassCard style={styles.cardSpacing}>
          <Text style={styles.sectionEyebrow}>Usuario</Text>
          <Text style={styles.nameText}>{session?.username || 'conductor'}</Text>
          <Text style={styles.metaText}>Rol: {rolesLabel}</Text>
          <Text style={styles.metaText}>Sesion activa hasta: {expiryLabel}</Text>
        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionEyebrow}>Cuenta</Text>
          <Text style={styles.sectionText}>Puedes cerrar sesion de forma segura desde aqui.</Text>

          <Pressable onPress={handleSignOut} style={styles.logoutButton}>
            <Ionicons color="#ffffff" name="log-out-outline" size={18} />
            <Text style={styles.logoutText}>Cerrar sesion</Text>
          </Pressable>
        </GlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  headerSpacer: {
    width: 36
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 18,
    gap: 10
  },
  cardSpacing: {
    gap: 6
  },
  sectionEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  nameText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800'
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  sectionText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 12
  },
  logoutButton: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '800'
  }
});
