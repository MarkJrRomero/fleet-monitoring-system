import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import { formatServiceError } from '../services/httpClient';
import {
  getDriverSimulationStatus,
  sendTelemetry,
  SimulationStatus,
  startDriverSimulation,
  stopDriverSimulation
} from '../services/telemetryService';
import { loadSimulatorQueue, saveSimulatorQueue } from '../storage/simulatorQueueStorage';
import { colors } from '../theme/colors';
import { LocalTelemetryEvent } from '../types/domain';
import { formatDuration } from '../utils/time';

const TUNNEL_SECONDS = 60;
const SIMULATION_TICK_MS = 4000;
const QUEUE_LIMIT = 120;
const BASE_COORDS = { lat: 4.711, lng: -74.0721 };

type DriverStackParamList = {
  DriverSimulator: undefined;
};

type DriverNavigation = NativeStackNavigationProp<DriverStackParamList, 'DriverSimulator'>;

export function DriverSimulatorScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const navigation = useNavigation<DriverNavigation>();

  const [tunnelMode, setTunnelMode] = useState(false);
  const [tunnelRemainingSeconds, setTunnelRemainingSeconds] = useState(0);
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus | null>(null);
  const [localSimulationActive, setLocalSimulationActive] = useState(false);
  const [simulationInitialized, setSimulationInitialized] = useState(false);
  const [loadingSimulationStatus, setLoadingSimulationStatus] = useState(true);
  const [changingSimulationStatus, setChangingSimulationStatus] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [resumeSimulationAfterTunnel, setResumeSimulationAfterTunnel] = useState(false);
  const [lastCoords, setLastCoords] = useState(BASE_COORDS);
  const [localQueue, setLocalQueue] = useState<LocalTelemetryEvent[]>([]);

  const updateEventStatus = (
    eventId: string,
    patch: Partial<Pick<LocalTelemetryEvent, 'deliveryStatus' | 'errorMessage' | 'retryCount' | 'sentAt'>>
  ) => {
    setLocalQueue((current) => {
      const next = current.map((event) => (event.id === eventId ? { ...event, ...patch } : event));
      void saveSimulatorQueue(next);
      return next;
    });
  };

  const enqueueEvent = (event: LocalTelemetryEvent) => {
    setLocalQueue((current) => {
      const next = [event, ...current].slice(0, QUEUE_LIMIT);
      void saveSimulatorQueue(next);
      return next;
    });
  };

  const buildSimulatedEvent = (): LocalTelemetryEvent => {
    const driftLat = (Math.random() - 0.5) * 0.00035;
    const driftLng = (Math.random() - 0.5) * 0.00035;
    const nextLat = Number((lastCoords.lat + driftLat).toFixed(6));
    const nextLng = Number((lastCoords.lng + driftLng).toFixed(6));

    setLastCoords({ lat: nextLat, lng: nextLng });

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      vehicleId: session?.username || 'DRIVER-UNKNOWN',
      lat: nextLat,
      lng: nextLng,
      speedKmh: Math.round(20 + Math.random() * 40),
      status: tunnelMode ? 'offline_buffered' : 'simulated',
      timestamp: new Date().toISOString(),
      deliveryStatus: 'pending',
      retryCount: 0
    };
  };


  const sendQueuedEvent = async (event: LocalTelemetryEvent) => {
    updateEventStatus(event.id, {
      deliveryStatus: 'sending',
      errorMessage: undefined
    });

    try {
      await sendTelemetry(
        {
          vehicle_id: event.vehicleId,
          lat: event.lat,
          lng: event.lng,
          speed_kmh: event.speedKmh,
          status: event.status,
          panic_button: event.panicButton,
          timestamp: event.timestamp
        },
        session?.accessToken
      );

      updateEventStatus(event.id, {
        deliveryStatus: 'sent',
        sentAt: new Date().toISOString(),
        errorMessage: undefined
      });
    } catch (error) {
      updateEventStatus(event.id, {
        deliveryStatus: 'failed',
        retryCount: event.retryCount + 1,
        errorMessage: formatServiceError(error, 'Fallo de envio')
      });
    }
  };

  const canSendNow = netInfo.isConnected !== false && !tunnelMode;

  useEffect(() => {
    if (!syncingQueue) {
      return;
    }

    const timer = setTimeout(() => {
      setSyncingQueue(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [syncingQueue]);

  useEffect(() => {
    let active = true;

    async function bootstrapQueue() {
      const stored = await loadSimulatorQueue();

      if (!active) {
        return;
      }

      setLocalQueue(stored);
      setQueueLoaded(true);
    }

    void bootstrapQueue();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const syncSimulationStatus = async (showLoading: boolean) => {
      if (showLoading) {
        setLoadingSimulationStatus(true);
      }

      try {
        const status = await getDriverSimulationStatus(session?.accessToken);

        if (!active) {
          return;
        }

        setSimulationStatus(status);
        if (!simulationInitialized) {
          setLocalSimulationActive(status.running);
          setSimulationInitialized(true);
        }
        setSimulationError(null);
      } catch (error) {
        if (active) {
          setSimulationError(formatServiceError(error, 'No se pudo consultar la simulacion dedicada'));
        }
      } finally {
        if (active && showLoading) {
          setLoadingSimulationStatus(false);
        }
      }
    };

    void syncSimulationStatus(true);
    const timer = setInterval(() => {
      void syncSimulationStatus(false);
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session?.accessToken, simulationInitialized]);

  useEffect(() => {
    if (!tunnelMode) {
      return;
    }

    if (tunnelRemainingSeconds <= 0) {
      void toggleTunnelMode(false);
      return;
    }

    const timer = setInterval(() => {
      setTunnelRemainingSeconds((value) => value - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [tunnelMode, tunnelRemainingSeconds]);

  const toggleTunnelMode = async (value: boolean) => {
    setTunnelMode(value);
    setTunnelRemainingSeconds(value ? TUNNEL_SECONDS : 0);

    try {
      if (value && simulationStatus?.running) {
        const nextStatus = await stopDriverSimulation(session?.accessToken);
        setSimulationStatus(nextStatus);
        if (localSimulationActive) {
          setResumeSimulationAfterTunnel(true);
        }
      }

      if (!value && localSimulationActive && !simulationStatus?.running && resumeSimulationAfterTunnel) {
        const nextStatus = await startDriverSimulation(SIMULATION_TICK_MS, session?.accessToken);
        setSimulationStatus(nextStatus);
        setResumeSimulationAfterTunnel(false);
      }
    } catch (error) {
      setSimulationError(formatServiceError(error, 'No se pudo sincronizar simulacion al cambiar modo tunel'));
    }
  };

  useEffect(() => {
    if (!localSimulationActive) {
      return;
    }

    const timer = setInterval(() => {
      enqueueEvent(buildSimulatedEvent());
    }, SIMULATION_TICK_MS);

    return () => clearInterval(timer);
  }, [localSimulationActive, tunnelMode, lastCoords, session?.username]);

  useEffect(() => {
    if (!queueLoaded || !canSendNow || syncingQueue) {
      return;
    }

    const panicPriorityEvent = localQueue.find(
      (event) => event.panicButton && (event.deliveryStatus === 'pending' || event.deliveryStatus === 'failed')
    );

    const retryableEvent =
      panicPriorityEvent ||
      [...localQueue].reverse().find((event) => event.deliveryStatus === 'pending' || event.deliveryStatus === 'failed');

    if (!retryableEvent) {
      return;
    }

    let active = true;
    setSyncingQueue(true);

    void sendQueuedEvent(retryableEvent).finally(() => {
      if (active) {
        setSyncingQueue(false);
      }
    });

    return () => {
      active = false;
    };
  }, [canSendNow, localQueue, queueLoaded, session?.accessToken, syncingQueue]);

  const toggleDriverSimulation = async () => {
    if (changingSimulationStatus) {
      return;
    }

    setChangingSimulationStatus(true);
    setSimulationError(null);

    try {
      if (localSimulationActive) {
        const nextStatus = simulationStatus?.running
          ? await stopDriverSimulation(session?.accessToken)
          : simulationStatus;

        if (nextStatus) {
          setSimulationStatus(nextStatus);
        }

        setLocalSimulationActive(false);
        setResumeSimulationAfterTunnel(false);
      } else {
        setLocalSimulationActive(true);

        if (tunnelMode) {
          setResumeSimulationAfterTunnel(true);
        } else {
          const nextStatus = await startDriverSimulation(SIMULATION_TICK_MS, session?.accessToken);
          setSimulationStatus(nextStatus);
        }
      }
    } catch (error) {
      setLocalSimulationActive(false);
      setResumeSimulationAfterTunnel(false);
      setSimulationError(
        formatServiceError(
          error,
          localSimulationActive
            ? 'No se pudo detener la simulacion dedicada'
            : 'No se pudo iniciar la simulacion dedicada'
        )
      );
    } finally {
      setChangingSimulationStatus(false);
    }
  };

  const simulationLabel = localSimulationActive ? 'Simulacion activa' : 'Simulacion pausada';
  const simulationTone = localSimulationActive ? 'success' : 'warning';
  const tunnelHelpText = tunnelMode
    ? `La app volvera a conectarse en ${formatDuration(tunnelRemainingSeconds)}.`
    : 'Activalo solo cuando quieras simular una perdida temporal de datos.';
  const queueSummary = `${localQueue.filter((event) => event.deliveryStatus === 'pending').length} pendientes · ${
    localQueue.filter((event) => event.deliveryStatus === 'failed').length
  } con error`;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}> 
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons color={colors.text} name="arrow-back" size={18} />
        </Pressable>
        <Text style={styles.headerTitle}>Simulador</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard>
          <Text style={styles.sectionEyebrow}>Simulador</Text>
          <Text style={styles.sectionTitle}>Control de recorrido</Text>
          <Text style={styles.sectionDescription}>
            {loadingSimulationStatus
              ? 'Consultando estado del simulador.'
              : simulationStatus?.running
                ? 'El simulador esta enviando movimiento.'
                : 'El simulador esta en pausa.'}
          </Text>

          <View style={styles.metaRow}>
            <StatusPill label={loadingSimulationStatus ? 'Consultando' : simulationLabel} tone={simulationTone} />
          </View>

          <Pressable
            onPress={toggleDriverSimulation}
            style={[
              styles.primaryButton,
              localSimulationActive ? styles.secondaryButton : styles.startButton,
              changingSimulationStatus && styles.disabledButton
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {changingSimulationStatus
                ? 'Actualizando...'
                : localSimulationActive
                  ? 'Pausar simulador'
                  : 'Activar simulador'}
            </Text>
          </Pressable>

        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionEyebrow}>Perdida de datos</Text>
          <Text style={styles.sectionTitle}>Desconexion temporal</Text>
          <Text style={styles.sectionDescription}>{tunnelHelpText}</Text>

          <View style={styles.switchRowCompact}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Perdida de conexion (1 min)</Text>
              <Text style={styles.switchHint}>
                {tunnelMode ? 'Modo activo en ventana controlada.' : 'Mantener apagado en uso normal.'}
              </Text>
            </View>

            <Switch
              onValueChange={(value) => {
                void toggleTunnelMode(value);
              }}
              thumbColor={tunnelMode ? colors.warning : '#e2e8f0'}
              trackColor={{ true: '#fde68a', false: '#dbeafe' }}
              value={tunnelMode}
            />
          </View>

          {tunnelMode ? <Text style={styles.warningText}>Reconectando en {formatDuration(tunnelRemainingSeconds)}</Text> : null}
        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionEyebrow}>Cola local</Text>
          <Text style={styles.sectionTitle}>Eventos guardados sin conexion</Text>
          <Text style={styles.sectionDescription}>
            {canSendNow ? 'Conectado: enviando cola al ingestor.' : 'Sin conexion/tunel: guardando localmente.'}
          </Text>

          <View style={styles.metaRowCompact}>
            <StatusPill label={canSendNow ? 'Enviando' : 'Buffer local'} tone={canSendNow ? 'success' : 'warning'} />
            <StatusPill label={syncingQueue ? 'Sincronizando' : 'En espera'} tone={syncingQueue ? 'warning' : 'neutral'} />
          </View>

          <Text style={styles.queueSummary}>{queueSummary}</Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.cellHeader, styles.cellTime]}>Hora</Text>
            <Text style={[styles.cellHeader, styles.cellType]}>Tipo</Text>
            <Text style={[styles.cellHeader, styles.cellState]}>Estado</Text>
            <Text style={[styles.cellHeader, styles.cellCoords]}>Posicion</Text>
          </View>

          {localQueue.slice(0, 12).map((event) => (
            <View key={event.id} style={styles.tableRow}>
              <Text style={[styles.cellValue, styles.cellTime]}>{new Date(event.timestamp).toLocaleTimeString('es-CO')}</Text>
              <Text style={[styles.cellValue, styles.cellType]}>{event.panicButton ? 'PANICO' : 'GPS'}</Text>
              <Text
                style={[
                  styles.cellValue,
                  styles.cellState,
                  event.deliveryStatus === 'sent' && styles.stateSent,
                  event.deliveryStatus === 'pending' && styles.statePending,
                  event.deliveryStatus === 'sending' && styles.stateSending,
                  event.deliveryStatus === 'failed' && styles.stateFailed
                ]}
              >
                {event.deliveryStatus}
              </Text>
              <Text style={[styles.cellValue, styles.cellCoords]}>
                {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
              </Text>
            </View>
          ))}

          {localQueue.length === 0 ? <Text style={styles.emptyTable}>Sin eventos locales todavia.</Text> : null}
        </GlassCard>

        {simulationError ? <Text style={styles.errorText}>{simulationError}</Text> : null}
      </ScrollView>
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
  metaRow: {
    marginTop: 10
  },
  metaRowCompact: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15
  },
  startButton: {
    backgroundColor: colors.primary
  },
  secondaryButton: {
    backgroundColor: '#64748b'
  },
  disabledButton: {
    opacity: 0.65
  },
  switchRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 10
  },
  switchCopy: {
    flex: 1,
    gap: 2
  },
  switchTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  switchHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  warningText: {
    color: colors.warning,
    fontWeight: '700',
    marginTop: 8
  },
  queueSummary: {
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 8
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
    marginBottom: 4
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
    paddingVertical: 7
  },
  cellHeader: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  cellValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  cellTime: {
    flex: 1
  },
  cellType: {
    flex: 0.9,
    textTransform: 'uppercase'
  },
  cellState: {
    flex: 1,
    textTransform: 'uppercase'
  },
  cellCoords: {
    flex: 1.4,
    textAlign: 'right'
  },
  stateSent: {
    color: colors.success
  },
  statePending: {
    color: colors.warning
  },
  stateSending: {
    color: colors.primaryDark
  },
  stateFailed: {
    color: colors.danger
  },
  emptyTable: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    marginTop: 4,
    paddingHorizontal: 16
  }
});
