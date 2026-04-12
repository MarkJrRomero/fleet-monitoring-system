import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { StatusPill } from '../components/StatusPill';
import { DEFAULT_VEHICLE_ID } from '../config/runtime';
import { useAuth } from '../context/AuthContext';
import {
  connectAlerts,
  connectPositions,
  fetchVehicles,
  getDriverSimulationStatus,
  sendTelemetry,
  SimulationStatus,
  startDriverSimulation,
  stopDriverSimulation
} from '../services/telemetryService';
import { formatServiceError } from '../services/httpClient';
import { appendAlert, loadAlerts } from '../storage/alertsStorage';
import { colors } from '../theme/colors';
import { AlertEvent, LocalAlert, PositionEvent, TripState, Vehicle } from '../types/domain';
import { distanceKm } from '../utils/geo';
import { formatDate, formatDuration } from '../utils/time';
import { getVehicleMapColor, getVehicleStatusLabel } from '../utils/vehicleStatus';

const TUNNEL_SECONDS = 10 * 60;
const DEFAULT_COORDINATE = { lat: 4.711, lng: -74.0721 };

type BottomTab = 'home' | 'trip' | 'alerts' | 'profile';

function toRegion(lat: number, lng: number): Region {
  return {
    latitude: lat,
    longitude: lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01
  };
}

export function TelemetryScreen() {
  const { session, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const mapRef = useRef<MapView | null>(null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [latestPosition, setLatestPosition] = useState<PositionEvent | null>(null);
  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const [trip, setTrip] = useState<TripState>({ active: false, distanceKm: 0 });
  const [activeTab, setActiveTab] = useState<BottomTab>('home');
  const [loadingMapData, setLoadingMapData] = useState(true);

  const [positionsSocketConnected, setPositionsSocketConnected] = useState(false);
  const [alertsSocketConnected, setAlertsSocketConnected] = useState(false);
  const [tunnelMode, setTunnelMode] = useState(false);
  const [tunnelRemainingSeconds, setTunnelRemainingSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sendingPanic, setSendingPanic] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus | null>(null);
  const [loadingSimulationStatus, setLoadingSimulationStatus] = useState(true);
  const [changingSimulationStatus, setChangingSimulationStatus] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const trackedVehicleId = DEFAULT_VEHICLE_ID;
  const trackedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.vehicle_id === trackedVehicleId) || null,
    [trackedVehicleId, vehicles]
  );

  const currentCoords = useMemo(() => {
    if (latestPosition && latestPosition.vehicle_id === trackedVehicleId) {
      return {
        lat: latestPosition.lat,
        lng: latestPosition.lng
      };
    }

    if (trackedVehicle) {
      return {
        lat: trackedVehicle.lat,
        lng: trackedVehicle.lng
      };
    }

    return DEFAULT_COORDINATE;
  }, [latestPosition, trackedVehicle, trackedVehicleId]);

  const connectionOk = Boolean(netInfo.isConnected) && positionsSocketConnected && !tunnelMode;
  const liveVehicleStatus = latestPosition?.status || trackedVehicle?.status || (connectionOk ? 'online' : 'unknown');
  const mapPinColor = getVehicleMapColor(liveVehicleStatus);
  const vehicleStatusLabel = getVehicleStatusLabel(liveVehicleStatus);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [localAlerts, vehiclesData] = await Promise.all([
          loadAlerts(),
          fetchVehicles(session?.accessToken)
        ]);

        if (!active) {
          return;
        }

        setAlerts(localAlerts);
        setVehicles(vehiclesData);
      } catch {
        if (active) {
          setAlerts(await loadAlerts());
        }
      } finally {
        if (active) {
          setLoadingMapData(false);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [session?.accessToken]);

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

  syncSimulationStatus(true);
  const timer = setInterval(() => {
    void syncSimulationStatus(false);
  }, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
  }, [session?.accessToken]);

  useEffect(() => {
    const disconnectPositions = connectPositions({
      onOpen: () => setPositionsSocketConnected(true),
      onClose: () => setPositionsSocketConnected(false),
      onError: () => setPositionsSocketConnected(false),
      onMessage: (event) => {
        if (!event.vehicle_id || event.vehicle_id !== trackedVehicleId) {
          return;
        }

        setLatestPosition(event);
        setTrip((prev) => {
          if (!prev.active) {
            return prev;
          }

          if (!prev.lastPoint) {
            return {
              ...prev,
              lastPoint: { lat: event.lat, lng: event.lng }
            };
          }

          const delta = distanceKm(prev.lastPoint.lat, prev.lastPoint.lng, event.lat, event.lng);
          return {
            ...prev,
            distanceKm: prev.distanceKm + delta,
            lastPoint: { lat: event.lat, lng: event.lng }
          };
        });
      }
    });

    const disconnectAlerts = connectAlerts({
      onOpen: () => setAlertsSocketConnected(true),
      onClose: () => setAlertsSocketConnected(false),
      onError: () => setAlertsSocketConnected(false),
      onMessage: async (event) => {
        const next = await appendAlert(fromBackendAlert(event));
        setAlerts(next);
      }
    });

    return () => {
      disconnectPositions();
      disconnectAlerts();
    };
  }, [trackedVehicleId]);

  useEffect(() => {
    mapRef.current?.animateToRegion(toRegion(currentCoords.lat, currentCoords.lng), 450);
  }, [currentCoords]);

  useEffect(() => {
    if (!trip.active || !trip.startedAt) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - trip.startedAt!) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [trip.active, trip.startedAt]);

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

  const currentVehicleLabel = trackedVehicle
    ? `${trackedVehicle.vehicle_id} (${trackedVehicle.imei || 'sin IMEI'})`
    : trackedVehicleId;

  const startTrip = () => {
    const initialPoint = latestPosition
      ? { lat: latestPosition.lat, lng: latestPosition.lng }
      : undefined;

    setTrip({
      active: true,
      startedAt: Date.now(),
      distanceKm: 0,
      lastPoint: initialPoint
    });
    setElapsedSeconds(0);
  };

  const stopTrip = () => {
    setTrip({ active: false, distanceKm: 0 });
    setElapsedSeconds(0);
  };

  const toggleTunnelMode = (value: boolean) => {
    setTunnelMode(value);
    setTunnelRemainingSeconds(value ? TUNNEL_SECONDS : 0);
  };

  const triggerPanic = async () => {
    if (!trackedVehicleId || sendingPanic) {
      return;
    }

    setSendingPanic(true);
    const lat = currentCoords.lat;
    const lng = currentCoords.lng;

    try {
      await sendTelemetry(
        {
          vehicle_id: trackedVehicleId,
          lat,
          lng,
          speed_kmh: latestPosition?.speed_kmh ?? 0,
          status: 'panic',
          panic_button: true,
          timestamp: new Date().toISOString()
        },
        session?.accessToken
      );

      const next = await appendAlert({
        id: `panic-${Date.now()}`,
        vehicleId: trackedVehicleId,
        type: 'Boton de panico',
        message: 'Pulsacion local enviada al backend',
        detectedAt: new Date().toISOString(),
        source: 'panic_local'
      });
      setAlerts(next);
      setActiveTab('alerts');
    } finally {
      setSendingPanic(false);
    }
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

  const effectiveSignal = connectionOk ? 'En linea' : tunnelMode ? 'Sin senal (tunel simulado)' : 'Conectividad inestable';
  const signalTone = connectionOk ? 'success' : tunnelMode ? 'warning' : 'danger';
  const simulationLabel = simulationStatus?.running ? 'Simulacion activa' : 'Simulacion detenida';
  const simulationTone = simulationStatus?.running ? 'success' : 'warning';

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        initialRegion={toRegion(currentCoords.lat, currentCoords.lng)}
        style={StyleSheet.absoluteFill}
      >
        <Marker
          coordinate={{ latitude: currentCoords.lat, longitude: currentCoords.lng }}
          description={currentVehicleLabel}
          title={trackedVehicleId}
        >
          <View style={styles.vehicleMarkerWrap}>
            <View style={[styles.vehicleMarker, { backgroundColor: mapPinColor }]}>
              <Ionicons color="#ffffff" name="car-sport" size={18} />
            </View>
            <View style={[styles.vehicleMarkerPointer, { borderTopColor: mapPinColor }]} />
          </View>
        </Marker>
      </MapView>

      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}> 
        <GlassCard style={styles.topCard}>
          <View style={styles.topRow}>
            <View style={styles.brandWrap}>
              <Image source={require('../../assets/logo.png')} style={styles.headerLogo} />
              <View>
                <Text style={styles.brand}>SMTF Conductor</Text>
                <Text style={styles.welcome}>Hola, {session?.username || 'conductor'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerStatusBlock}>
            <View style={styles.statusRow}>
              <StatusPill label={effectiveSignal} tone={signalTone} />
              <Text style={styles.statusMetaStrong}>{vehicleStatusLabel}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.statusMeta}>Vehiculo: {trackedVehicleId}</Text>
              <Text style={styles.statusMeta}>Velocidad: {(latestPosition?.speed_kmh || 0).toFixed(1)} km/h</Text>
            </View>
          </View>
        </GlassCard>
      </View>

      <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 10 }]}> 
        <GlassCard style={styles.panelCard}>
          {loadingMapData ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Cargando posicion del vehiculo...</Text>
            </View>
          ) : null}

          {!loadingMapData && activeTab === 'home' ? (
            <View>
              <Text style={styles.sectionTitle}>Estado en vivo</Text>
              <Text style={styles.infoLine}>{currentVehicleLabel}</Text>
              <Text style={styles.infoLine}>Ultimo reporte: {latestPosition?.recorded_at ? formatDate(latestPosition.recorded_at) : 'Sin datos'}</Text>

        <View style={styles.simulationRow}>
        <StatusPill label={loadingSimulationStatus ? 'Consultando simulacion' : simulationLabel} tone={simulationTone} />
        <Text style={styles.simulationMeta}>Tick: {simulationStatus?.tick_ms ?? 0} ms</Text>
        </View>
        <Text style={styles.infoLine}>Eventos enviados: {simulationStatus?.requests_sent ?? 0}</Text>
        <Pressable
        onPress={toggleDriverSimulation}
        style={[
          styles.tripButton,
          simulationStatus?.running ? styles.stopButton : styles.startButton,
          changingSimulationStatus && styles.disabledButton
        ]}
        >
        <Text style={styles.tripButtonText}>
          {changingSimulationStatus
          ? 'Actualizando...'
          : simulationStatus?.running
            ? 'Detener simulacion del vehiculo'
            : 'Activar simulacion del vehiculo'}
        </Text>
        </Pressable>
        {simulationError ? <Text style={styles.errorText}>{simulationError}</Text> : null}

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Simular perdida de conexion (10 min)</Text>
                <Switch
                  onValueChange={toggleTunnelMode}
                  thumbColor={tunnelMode ? colors.warning : '#e2e8f0'}
                  trackColor={{ true: '#fde68a', false: '#dbeafe' }}
                  value={tunnelMode}
                />
              </View>
              {tunnelMode ? <Text style={styles.warningText}>Reconectando en {formatDuration(tunnelRemainingSeconds)}</Text> : null}
            </View>
          ) : null}

          {!loadingMapData && activeTab === 'trip' ? (
            <View>
              <Text style={styles.sectionTitle}>Viaje actual</Text>
              <Text style={styles.infoLine}>Duracion: {formatDuration(elapsedSeconds)}</Text>
              <Text style={styles.infoLine}>Distancia: {trip.distanceKm.toFixed(2)} km</Text>
              <Pressable
                onPress={trip.active ? stopTrip : startTrip}
                style={[styles.tripButton, trip.active ? styles.stopButton : styles.startButton]}
              >
                <Text style={styles.tripButtonText}>{trip.active ? 'Finalizar viaje' : 'Iniciar viaje'}</Text>
              </Pressable>
            </View>
          ) : null}

          {!loadingMapData && activeTab === 'alerts' ? (
            <View>
              <Text style={styles.sectionTitle}>Alertas locales</Text>
              <FlatList
                data={alerts}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={<Text style={styles.empty}>No hay alertas registradas.</Text>}
                renderItem={({ item }) => (
                  <View style={styles.alertItem}>
                    <View style={styles.alertHeaderRow}>
                      <Text style={styles.alertType}>{item.type}</Text>
                      <StatusPill label={item.source === 'panic_local' ? 'Local' : 'Backend'} tone="warning" />
                    </View>
                    <Text style={styles.alertDetail}>Vehiculo: {item.vehicleId}</Text>
                    <Text style={styles.alertDetail}>{item.message}</Text>
                    <Text style={styles.alertDate}>{formatDate(item.detectedAt)}</Text>
                  </View>
                )}
                style={styles.alertsList}
              />
            </View>
          ) : null}

          {!loadingMapData && activeTab === 'profile' ? (
            <View>
              <Text style={styles.sectionTitle}>Perfil del conductor</Text>
              <Text style={styles.infoLine}>Usuario: {session?.username || 'conductor'}</Text>
              <Text style={styles.infoLine}>Vehiculo asignado: {trackedVehicleId}</Text>
              <Text style={styles.infoLine}>Estado actual: {vehicleStatusLabel}</Text>
              <Text style={styles.infoLine}>Conexion: {effectiveSignal}</Text>
              <Text style={styles.infoLine}>Simulacion dedicada: {simulationLabel}</Text>

              <Pressable onPress={signOut} style={styles.profileLogoutButton}>
                <Ionicons color="#ffffff" name="log-out-outline" size={18} />
                <Text style={styles.profileLogoutText}>Cerrar sesion</Text>
              </Pressable>
            </View>
          ) : null}
        </GlassCard>

        <View style={styles.bottomBar}>
          <Pressable onPress={() => setActiveTab('home')} style={[styles.tabButton, activeTab === 'home' && styles.tabButtonActive]}>
            <Ionicons color={activeTab === 'home' ? colors.primaryDark : colors.textMuted} name="navigate" size={20} />
            <Text style={[styles.tabText, activeTab === 'home' && styles.tabTextActive]}>Inicio</Text>
          </Pressable>

          <Pressable onPress={() => setActiveTab('trip')} style={[styles.tabButton, activeTab === 'trip' && styles.tabButtonActive]}>
            <Ionicons color={activeTab === 'trip' ? colors.primaryDark : colors.textMuted} name="car-sport" size={20} />
            <Text style={[styles.tabText, activeTab === 'trip' && styles.tabTextActive]}>Viaje</Text>
          </Pressable>

          <Pressable disabled={sendingPanic} onPress={triggerPanic} style={styles.panicButton}>
            <Ionicons color="#ffffff" name="alert" size={20} />
            <Text style={styles.panicText}>{sendingPanic ? 'Enviando' : 'Panico'}</Text>
          </Pressable>

          <Pressable onPress={() => setActiveTab('alerts')} style={[styles.tabButton, activeTab === 'alerts' && styles.tabButtonActive]}>
            <Ionicons color={activeTab === 'alerts' ? colors.primaryDark : colors.textMuted} name="notifications" size={20} />
            <Text style={[styles.tabText, activeTab === 'alerts' && styles.tabTextActive]}>Alertas</Text>
          </Pressable>

          <Pressable onPress={() => setActiveTab('profile')} style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}>
            <Ionicons color={activeTab === 'profile' ? colors.primaryDark : colors.textMuted} name="person-circle" size={20} />
            <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>Perfil</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
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
    flex: 1
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12
  },
  topCard: {
    padding: 12
  },
  bottomOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    gap: 8
  },
  panelCard: {
    minHeight: 150,
    maxHeight: 270
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  loadingText: {
    color: colors.textMuted,
    fontWeight: '600'
  },
  vehicleMarkerWrap: {
    alignItems: 'center'
  },
  vehicleMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(15, 23, 42, 0.2)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  vehicleMarkerPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 10
  },
  brand: {
    color: colors.primaryDark,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  welcome: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800'
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  headerStatusBlock: {
    gap: 4
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  statusMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  statusMetaStrong: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800'
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 8
  },
  infoLine: {
    color: colors.text,
    fontWeight: '600',
    marginBottom: 4
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10
  },
  switchLabel: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
    fontSize: 13
  },
  simulationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
    marginTop: 4
  },
  simulationMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  warningText: {
    color: colors.warning,
    fontWeight: '700'
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    marginTop: 8
  },
  tripButton: {
    minHeight: 42,
    marginTop: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tripButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  startButton: {
    backgroundColor: colors.primary
  },
  stopButton: {
    backgroundColor: '#64748b'
  },
  disabledButton: {
    opacity: 0.65
  },
  panicButton: {
    backgroundColor: colors.danger,
    borderRadius: 999,
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  panicText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  alertsList: {
    maxHeight: 170
  },
  profileLogoutButton: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  profileLogoutText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  alertItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 10,
    marginBottom: 8
  },
  alertHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  alertType: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800'
  },
  alertDetail: {
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '600'
  },
  alertDate: {
    color: colors.textMuted,
    marginTop: 6
  },
  empty: {
    color: colors.textMuted,
    fontWeight: '600'
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 8
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabButtonActive: {
    backgroundColor: '#dff7f3'
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700'
  },
  tabTextActive: {
    color: colors.primaryDark
  }
});
