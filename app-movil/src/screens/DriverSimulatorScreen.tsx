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
  SimulationStatus,
  startDriverSimulation,
  stopDriverSimulation
} from '../services/telemetryService';
import { colors } from '../theme/colors';
import { formatDuration } from '../utils/time';

const TUNNEL_SECONDS = 10 * 60;

type DriverStackParamList = {
  DriverSimulator: undefined;
};

type DriverNavigation = NativeStackNavigationProp<DriverStackParamList, 'DriverSimulator'>;

export function DriverSimulatorScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<DriverNavigation>();

  const [tunnelMode, setTunnelMode] = useState(false);
  const [tunnelRemainingSeconds, setTunnelRemainingSeconds] = useState(0);
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus | null>(null);
  const [loadingSimulationStatus, setLoadingSimulationStatus] = useState(true);
  const [changingSimulationStatus, setChangingSimulationStatus] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

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
  }, [session?.accessToken]);

  useEffect(() => {
    if (!tunnelMode) {
      return;
    }

    if (tunnelRemainingSeconds <= 0) {
      setTunnelMode(false);
      return;
    }

    const timer = setInterval(() => {
      setTunnelRemainingSeconds((value) => value - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [tunnelMode, tunnelRemainingSeconds]);

  const toggleTunnelMode = (value: boolean) => {
    setTunnelMode(value);
    setTunnelRemainingSeconds(value ? TUNNEL_SECONDS : 0);
  };

  const toggleDriverSimulation = async () => {
    if (changingSimulationStatus) {
      return;
    }

    setChangingSimulationStatus(true);
    setSimulationError(null);

    try {
      const nextStatus = simulationStatus?.running
        ? await stopDriverSimulation(session?.accessToken)
        : await startDriverSimulation(4000, session?.accessToken);

      setSimulationStatus(nextStatus);
    } catch (error) {
      setSimulationError(
        formatServiceError(
          error,
          simulationStatus?.running
            ? 'No se pudo detener la simulacion dedicada'
            : 'No se pudo iniciar la simulacion dedicada'
        )
      );
    } finally {
      setChangingSimulationStatus(false);
    }
  };

  const simulationLabel = simulationStatus?.running ? 'Simulacion activa' : 'Simulacion pausada';
  const simulationTone = simulationStatus?.running ? 'success' : 'warning';
  const tunnelHelpText = tunnelMode
    ? `La app volvera a conectarse en ${formatDuration(tunnelRemainingSeconds)}.`
    : 'Activalo solo cuando quieras simular una perdida temporal de datos.';

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
              simulationStatus?.running ? styles.secondaryButton : styles.startButton,
              changingSimulationStatus && styles.disabledButton
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {changingSimulationStatus
                ? 'Actualizando...'
                : simulationStatus?.running
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
              <Text style={styles.switchTitle}>Perdida de conexion (10 min)</Text>
              <Text style={styles.switchHint}>
                {tunnelMode ? 'Modo activo en ventana controlada.' : 'Mantener apagado en uso normal.'}
              </Text>
            </View>

            <Switch
              onValueChange={toggleTunnelMode}
              thumbColor={tunnelMode ? colors.warning : '#e2e8f0'}
              trackColor={{ true: '#fde68a', false: '#dbeafe' }}
              value={tunnelMode}
            />
          </View>

          {tunnelMode ? <Text style={styles.warningText}>Reconectando en {formatDuration(tunnelRemainingSeconds)}</Text> : null}
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
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    marginTop: 4,
    paddingHorizontal: 16
  }
});
