import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { StatusPill } from '../components/StatusPill';
import { DEFAULT_VEHICLE_ID } from '../config/runtime';
import { useAuth } from '../context/AuthContext';
import { formatServiceError } from '../services/httpClient';
import { connectPositions, fetchVehicles, sendTelemetry } from '../services/telemetryService';
import { colors } from '../theme/colors';
import { PositionEvent, Vehicle } from '../types/domain';
import { getVehicleMapColor } from '../utils/vehicleStatus';

const DEFAULT_COORDINATE = { lat: 4.711, lng: -74.0721 };

type DriverStackParamList = {
  Telemetry: undefined;
  DriverSimulator: undefined;
  DriverAlerts: undefined;
  DriverProfile: undefined;
};

type DriverNavigation = NativeStackNavigationProp<DriverStackParamList, 'Telemetry'>;

function toRegion(lat: number, lng: number): Region {
  return {
    latitude: lat,
    longitude: lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01
  };
}

export function TelemetryScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const navigation = useNavigation<DriverNavigation>();
  const mapRef = useRef<MapView | null>(null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [latestPosition, setLatestPosition] = useState<PositionEvent | null>(null);
  const [loadingMapData, setLoadingMapData] = useState(true);
  const [positionsSocketConnected, setPositionsSocketConnected] = useState(false);
  const [sendingPanic, setSendingPanic] = useState(false);
  const [panicMessage, setPanicMessage] = useState<string | null>(null);

  const trackedVehicleId = DEFAULT_VEHICLE_ID;
  const trackedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.vehicle_id === trackedVehicleId) || null,
    [trackedVehicleId, vehicles]
  );

  const currentCoords = useMemo(() => {
    const position = latestPosition;

    if (position && position.vehicle_id === trackedVehicleId) {
      return {
        lat: position.lat,
        lng: position.lng
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

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const vehiclesData = await fetchVehicles(session?.accessToken);

        if (!active) {
          return;
        }

        setVehicles(vehiclesData);
      } catch (error) {
        if (active) {
          setPanicMessage(formatServiceError(error, 'No se pudo cargar la posicion del vehiculo.'));
        }
      } finally {
        if (active) {
          setLoadingMapData(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    const disconnectPositions = connectPositions(session?.accessToken, {
      onOpen: () => setPositionsSocketConnected(true),
      onClose: () => setPositionsSocketConnected(false),
      onError: () => setPositionsSocketConnected(false),
      onMessage: (event) => {
        if (!event.vehicle_id || event.vehicle_id !== trackedVehicleId) {
          return;
        }

        setLatestPosition(event);
      }
    });

    return () => {
      disconnectPositions();
    };
  }, [session?.accessToken, trackedVehicleId]);

  useEffect(() => {
    mapRef.current?.animateToRegion(toRegion(currentCoords.lat, currentCoords.lng), 450);
  }, [currentCoords]);

  const focusVehicleOnMap = () => {
    mapRef.current?.animateToRegion(toRegion(currentCoords.lat, currentCoords.lng), 450);
  };

  const triggerPanic = async () => {
    if (sendingPanic) {
      return;
    }

    setSendingPanic(true);
    setPanicMessage(null);

    try {
      await sendTelemetry(
        {
          vehicle_id: trackedVehicleId,
          lat: currentCoords.lat,
          lng: currentCoords.lng,
          speed_kmh: latestPosition?.speed_kmh ?? 0,
          status: 'panic',
          panic_button: true,
          timestamp: new Date().toISOString()
        },
        session?.accessToken
      );

      setPanicMessage('Alerta de panico enviada correctamente.');
    } catch (error) {
      setPanicMessage(formatServiceError(error, 'No se pudo enviar la alerta de panico.'));
    } finally {
      setSendingPanic(false);
    }
  };

  const currentVehicleLabel = trackedVehicle?.vehicle_id || trackedVehicleId;
  const connectionOk = Boolean(netInfo.isConnected) && positionsSocketConnected;
  const mapPinColor = getVehicleMapColor(latestPosition?.status || trackedVehicle?.status || 'unknown');
  const effectiveSignal = connectionOk ? 'En linea' : 'Conectividad inestable';
  const signalTone = connectionOk ? 'success' : 'danger';

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        initialRegion={toRegion(currentCoords.lat, currentCoords.lng)}
        style={StyleSheet.absoluteFill}
      >
        <Marker
          coordinate={{ latitude: currentCoords.lat, longitude: currentCoords.lng }}
          description="Vehiculo asignado"
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
              <View style={styles.brandTextWrap}>
                <Text style={styles.brand}>SMTF Conductor</Text>
                <Text style={styles.welcome}>Hola, {session?.username || 'conductor'}</Text>
                <Text style={styles.subtitle}>Mapa limpio con accesos rapidos.</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerStatusBlock}>
            <View style={styles.statusRow}>
              <StatusPill label={effectiveSignal} tone={signalTone} />
              <Text style={styles.vehicleChip}>{currentVehicleLabel}</Text>
            </View>
          </View>
        </GlassCard>
      </View>

      <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 10 }]}> 
        {panicMessage ? <Text style={styles.infoBanner}>{panicMessage}</Text> : null}

        <View style={styles.bottomBar}>
          <Pressable onPress={focusVehicleOnMap} style={[styles.tabButton, styles.tabButtonActive]}>
            <Ionicons color={colors.primaryDark} name="navigate" size={20} />
            <Text style={[styles.tabText, styles.tabTextActive]}>Navegacion</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('DriverSimulator')} style={styles.tabButton}>
            <Ionicons color={colors.textMuted} name="pulse-outline" size={20} />
            <Text style={styles.tabText}>Simulador</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('DriverAlerts')} style={styles.tabButton}>
            <Ionicons color={colors.textMuted} name="notifications-outline" size={20} />
            <Text style={styles.tabText}>Alertas</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('DriverProfile')} style={styles.tabButton}>
            <Ionicons color={colors.textMuted} name="person-circle-outline" size={20} />
            <Text style={styles.tabText}>Perfil</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        disabled={sendingPanic}
        onPress={triggerPanic}
        style={[styles.panicFab, { bottom: insets.bottom + 84 }, sendingPanic && styles.disabledButton]}
      >
        <Ionicons color="#ffffff" name="alert" size={20} />
        <Text style={styles.panicText}>{sendingPanic ? 'Enviando' : 'Panico'}</Text>
      </Pressable>
    </View>
  );
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
    padding: 14
  },
  bottomOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    gap: 8
  },
  infoBanner: {
    color: colors.text,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'center'
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  brandTextWrap: {
    flex: 1
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
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2
  },
  headerStatusBlock: {
    gap: 8
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  vehicleChip: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: '#eef5ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 6
  },
  tabButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabButtonActive: {
    backgroundColor: '#dff7f3'
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  tabTextActive: {
    color: colors.primaryDark
  },
  panicFab: {
    position: 'absolute',
    right: 18,
    backgroundColor: colors.danger,
    borderRadius: 999,
    minHeight: 52,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7
  },
  panicText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  disabledButton: {
    opacity: 0.65
  }
});
