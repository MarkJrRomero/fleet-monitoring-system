import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import { connectAlerts } from '../services/telemetryService';
import { appendAlert, loadAlerts } from '../storage/alertsStorage';
import { colors } from '../theme/colors';
import { AlertEvent, LocalAlert } from '../types/domain';
import { formatDate } from '../utils/time';

type DriverStackParamList = {
  DriverAlerts: undefined;
};

type DriverNavigation = NativeStackNavigationProp<DriverStackParamList, 'DriverAlerts'>;

export function DriverAlertsScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<DriverNavigation>();

  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const [alertsSocketConnected, setAlertsSocketConnected] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const persisted = await loadAlerts();
      if (active) {
        setAlerts(persisted);
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const disconnectAlerts = connectAlerts(session?.accessToken, {
      onOpen: () => setAlertsSocketConnected(true),
      onClose: () => setAlertsSocketConnected(false),
      onError: () => setAlertsSocketConnected(false),
      onMessage: async (event) => {
        const next = await appendAlert(fromBackendAlert(event));
        setAlerts(next);
      }
    });

    return () => {
      disconnectAlerts();
    };
  }, [session?.accessToken]);

  const alertsConnectionLabel = alertsSocketConnected ? 'Alertas en tiempo real' : 'Sincronizando alertas';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}> 
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons color={colors.text} name="arrow-back" size={18} />
        </Pressable>
        <Text style={styles.headerTitle}>Alertas</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <GlassCard>
          <Text style={styles.sectionEyebrow}>Alertas</Text>
          <Text style={styles.sectionTitle}>Ultimas alertas recibidas</Text>
          <Text style={styles.sectionDescription}>{alertsConnectionLabel}</Text>

          <FlatList
            data={alerts.slice(0, 25)}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.emptyAlerts}>Aun no se han recibido alertas.</Text>}
            renderItem={({ item }) => (
              <View style={styles.alertCard}>
                <View style={styles.alertCardHeader}>
                  <Text style={styles.alertMessage} numberOfLines={2}>{item.message}</Text>
                  <StatusPill label={item.type} tone={getAlertTone(item.type)} />
                </View>
                <Text style={styles.alertMeta}>{item.vehicleId} • {formatDate(item.detectedAt)}</Text>
              </View>
            )}
            style={styles.alertList}
            showsVerticalScrollIndicator={false}
          />
        </GlassCard>
      </View>
    </View>
  );
}

function getAlertTone(type: string): 'danger' | 'warning' | 'neutral' {
  const t = type.toLowerCase();
  if (t.includes('panico') || t.includes('velocidad')) return 'danger';
  if (t.includes('detenido')) return 'warning';
  return 'neutral';
}

function fromBackendAlert(event: AlertEvent): LocalAlert {
  return {
    id: `ws-${event.vehicle_id}-${Date.now()}`,
    vehicleId: event.vehicle_id,
    type: event.type || 'Alerta operativa',
    message: event.message || 'Evento recibido por websocket',
    detectedAt: event.detected_at || new Date().toISOString(),
    source: 'backend_ws'
  };
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
    flex: 1
  },
  sectionEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 18,
    marginTop: 4
  },
  sectionDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 4
  },
  alertList: {
    marginTop: 10,
    maxHeight: '100%'
  },
  emptyAlerts: {
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 8
  },
  alertCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    padding: 10,
    marginBottom: 8,
    gap: 5
  },
  alertCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  alertType: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
    flex: 1
  },
  alertMessage: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
    flex: 1
  },
  alertMeta: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 11
  }
});
