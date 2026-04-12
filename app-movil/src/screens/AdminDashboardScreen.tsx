import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
	FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import ClusteredMapView from 'react-native-map-clustering';
import { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import { formatServiceError } from '../services/httpClient';
import { connectAlerts, connectPositions, fetchVehicles } from '../services/telemetryService';
import { colors } from '../theme/colors';
import { AlertEvent, LocalAlert, PositionEvent, Vehicle } from '../types/domain';
import { formatDate } from '../utils/time';
import { getVehicleMapColor, getVehicleStatusLabel } from '../utils/vehicleStatus';

const DEFAULT_REGION: Region = {
	latitude: 4.711,
	longitude: -74.0721,
	latitudeDelta: 5.5,
	longitudeDelta: 5.5
};

type BottomTab = 'fleet' | 'alerts' | 'profile';

function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return null;
}

function hasValidCoordinate(vehicle: Vehicle): boolean {
	return toNumber(vehicle.lat) !== null && toNumber(vehicle.lng) !== null;
}

function formatCoordinate(value: number | undefined): string {
	const parsed = toNumber(value);
	if (parsed === null) {
		return '--';
	}
	return parsed.toFixed(5);
}

function clusterCount(cluster: any): number {
	const raw = cluster?.properties?.point_count;
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : 0;
}

function clusterColorByCount(count: number): string {
	if (count >= 120) {
		return '#b91c1c';
	}
	if (count >= 60) {
		return '#c2410c';
	}
	if (count >= 20) {
		return '#0f766e';
	}
	return '#0d9488';
}

export function AdminDashboardScreen() {
	const { session, signOut } = useAuth();
	const insets = useSafeAreaInsets();
	const mapRef = useRef<any>(null);

	const [vehicles, setVehicles] = useState<Vehicle[]>([]);
	const [alerts, setAlerts] = useState<LocalAlert[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<BottomTab>('fleet');
	const [positionsSocketConnected, setPositionsSocketConnected] = useState(false);
	const [alertsSocketConnected, setAlertsSocketConnected] = useState(false);
	const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;

		async function bootstrap() {
			try {
				const vehiclesData = await fetchVehicles(session?.accessToken);

				if (!active) {
					return;
				}

				setVehicles(vehiclesData);
				const firstMappable = vehiclesData.find(hasValidCoordinate);
				setSelectedVehicleId((current) => current || firstMappable?.vehicle_id || null);
				setLoadError(null);
			} catch (error) {
				if (active) {
					setLoadError(formatServiceError(error, 'No se pudo cargar la flota desde el backend'));
					setVehicles([]);
				}
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		}

		bootstrap();

		return () => {
			active = false;
		};
	}, [session?.accessToken]);

	useEffect(() => {
		const disconnectPositions = connectPositions({
			onOpen: () => setPositionsSocketConnected(true),
			onClose: () => setPositionsSocketConnected(false),
			onError: () => setPositionsSocketConnected(false),
			onMessage: (event) => {
				setVehicles((current) => {
					const index = current.findIndex((vehicle) => vehicle.vehicle_id === event.vehicle_id);

					if (index === -1) {
						return current;
					}

					const next = [...current];
					next[index] = {
						...next[index],
						lat: event.lat,
						lng: event.lng,
						status: event.status || next[index].status
					};
					return next;
				});
			}
		});

		const disconnectAlerts = connectAlerts({
			onOpen: () => setAlertsSocketConnected(true),
			onClose: () => setAlertsSocketConnected(false),
			onError: () => setAlertsSocketConnected(false),
			onMessage: (event) => {
				setAlerts((current) => [fromBackendAlert(event), ...current].slice(0, 40));
				if (event.type) {
					setVehicles((current) =>
						current.map((vehicle) =>
							vehicle.vehicle_id === event.vehicle_id
								? { ...vehicle, status: statusFromAlert(event.type, vehicle.status) }
								: vehicle
						)
					);
				}
			}
		});

		return () => {
			disconnectPositions();
			disconnectAlerts();
		};
	}, []);

	const mappableVehicles = useMemo(
		() => vehicles.filter(hasValidCoordinate),
		[vehicles]
	);

	const selectedVehicle = useMemo(
		() => vehicles.find((vehicle) => vehicle.vehicle_id === selectedVehicleId) || null,
		[vehicles, selectedVehicleId]
	);

	const onlineCount = useMemo(
		() => vehicles.filter((vehicle) => (vehicle.status || '').toLowerCase() === 'online').length,
		[vehicles]
	);

	const criticalCount = useMemo(
		() => vehicles.filter((vehicle) => ['panic', 'overspeed'].includes((vehicle.status || '').toLowerCase())).length,
		[vehicles]
	);

	const focusVehicle = (vehicle: Vehicle) => {
		const lat = toNumber(vehicle.lat);
		const lng = toNumber(vehicle.lng);
		if (lat === null || lng === null) {
			return;
		}
		const maxFocusZoom = 18.8;

		setSelectedVehicleId(vehicle.vehicle_id);
		if (typeof mapRef.current?.animateCamera === 'function') {
			mapRef.current.animateCamera(
				{
					center: { latitude: lat, longitude: lng },
					zoom: maxFocusZoom
				},
				{ duration: 380 }
			);
			return;
		}

		mapRef.current?.animateToRegion(
			{
				latitude: lat,
				longitude: lng,
				latitudeDelta: 0.006,
				longitudeDelta: 0.006
			},
			380
		);
	};

	const clearSelection = () => {
		setSelectedVehicleId(null);
	};

	const focusVehicleByID = (vehicleID: string) => {
		const target = vehicles.find((vehicle) => vehicle.vehicle_id === vehicleID);
		if (!target) {
			return;
		}

		setActiveTab('fleet');
		focusVehicle(target);
	};

	return (
		<View style={styles.container}>
			<ClusteredMapView
				ref={mapRef}
				animationEnabled
				tracksViewChanges={false}
				clusterColor={colors.primaryDark}
				clusterTextColor="#ffffff"
				initialRegion={DEFAULT_REGION}
				minPoints={2}
				radius={45}
				preserveClusterPressBehavior={false}
				renderCluster={(cluster: any) => (
					// react-native-map-clustering entrega la posicion en geometry.coordinates
					// [lng, lat], no en cluster.coordinate.
					// El conteo viene en properties.point_count(_abbreviated).
					// Ajuste visual para Android: tamano y color dinamico por volumen.
					<Marker
						key={`cluster-${cluster.properties?.cluster_id ?? cluster.id}`}
						anchor={{ x: 0.5, y: 0.5 }}
						coordinate={{
							latitude: cluster.geometry.coordinates[1],
							longitude: cluster.geometry.coordinates[0]
						}}
						onPress={cluster.onPress}
					>
						<View style={[styles.clusterWrap, { backgroundColor: clusterColorByCount(clusterCount(cluster)) }]}>
							<Text style={styles.clusterText}>
								{String(cluster.properties?.point_count_abbreviated ?? cluster.properties?.point_count ?? '0')}
							</Text>
						</View>
					</Marker>
				)}
				style={StyleSheet.absoluteFill}
			>
				{mappableVehicles.map((vehicle) => {
					const lat = toNumber(vehicle.lat);
					const lng = toNumber(vehicle.lng);
					if (lat === null || lng === null) {
						return null;
					}

					return (
					<Marker
						coordinate={{ latitude: lat, longitude: lng }}
						key={vehicle.vehicle_id}
						anchor={{ x: 0.5, y: 0.5 }}
						onPress={() => focusVehicle(vehicle)}
						title={vehicle.vehicle_id}
						description={`Estado: ${getVehicleStatusLabel(vehicle.status)}`}
					>
						<View style={styles.markerWrap}>
							<View
								style={[
									styles.marker,
									{ backgroundColor: getVehicleMapColor(vehicle.status) },
									selectedVehicleId === vehicle.vehicle_id && styles.markerSelected
								]}
							>
								<Ionicons color="#ffffff" name="car-sport" size={16} />
							</View>
						</View>
					</Marker>
					);
				})}
			</ClusteredMapView>

			{activeTab === 'fleet' && selectedVehicle ? (
				<View style={[styles.vehicleDetailOverlay, { bottom: insets.bottom + 86 }]}> 
					<GlassCard style={styles.vehicleDetailCard}>
						<View style={styles.selectedVehicleHeader}>
							<Text style={styles.selectedVehicleTitle}>{selectedVehicle.vehicle_id}</Text>
							<View style={styles.selectedVehicleHeaderRight}>
								<StatusPill label={getVehicleStatusLabel(selectedVehicle.status)} tone={statusTone(selectedVehicle.status)} />
								<Pressable onPress={clearSelection} style={styles.closeDetailButton}>
									<Ionicons color={colors.textMuted} name="close" size={16} />
								</Pressable>
							</View>
						</View>
						<Text style={styles.infoLine}>IMEI: {selectedVehicle.imei || 'sin IMEI'}</Text>
						<Text style={styles.infoLine}>Coordenadas: {formatCoordinate(selectedVehicle.lat)}, {formatCoordinate(selectedVehicle.lng)}</Text>
					</GlassCard>
				</View>
			) : null}

			<View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}> 
				<GlassCard style={styles.topCard}>
					<View style={styles.topRow}>
						<View style={styles.brandWrap}>
							<Image source={require('../../assets/logo.png')} style={styles.headerLogo} />
							<View>
								<Text style={styles.brand}>SMTF Admin Movil</Text>
								<Text style={styles.welcome}>Hola, {session?.username || 'admin'}</Text>
							</View>
						</View>
					</View>

					<View style={styles.metricsRow}>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Flota</Text>
							<Text style={styles.metricValue}>{vehicles.length}</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Online</Text>
							<Text style={styles.metricValue}>{onlineCount}</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Criticos</Text>
							<Text style={styles.metricValue}>{criticalCount}</Text>
						</View>
					</View>
					{loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
				</GlassCard>
			</View>

			<View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 10 }]}> 
				{activeTab !== 'fleet' ? (
					<GlassCard style={styles.panelCard}>
						{loading ? (
							<View style={styles.loadingWrap}>
								<ActivityIndicator color={colors.primary} />
								<Text style={styles.loadingText}>Cargando flota...</Text>
							</View>
						) : null}

						{!loading && activeTab === 'alerts' ? (
						<View style={styles.panelSection}>
							<Text style={styles.sectionTitle}>Alertas operativas</Text>
							<FlatList
								data={alerts}
								keyExtractor={(item) => item.id}
								ListEmptyComponent={<Text style={styles.empty}>No hay alertas recientes en esta sesion.</Text>}
								renderItem={({ item }) => (
									<Pressable onPress={() => focusVehicleByID(item.vehicleId)} style={styles.alertItem}>
										<View style={styles.alertHeader}>
											<Text style={styles.alertType}>{item.type}</Text>
											<StatusPill label={item.type} tone={alertTone(item.type)} />
										</View>
										<Text style={styles.vehicleMeta}>Vehiculo: {item.vehicleId}</Text>
										<Text style={styles.vehicleMeta}>{item.message}</Text>
										<Text style={styles.alertDate}>{formatDate(item.detectedAt)}</Text>
										<Text style={styles.alertHint}>Toca para enfocar en mapa</Text>
									</Pressable>
								)}
								style={styles.list}
							/>
						</View>
						) : null}

						{!loading && activeTab === 'profile' ? (
						<View style={styles.panelSection}>
							<Text style={styles.sectionTitle}>Perfil administrador</Text>
							<Text style={styles.infoLine}>Usuario: {session?.username || 'admin'}</Text>
							<Text style={styles.infoLine}>Rol: administrador</Text>
							<Text style={styles.infoLine}>Vehiculos visibles: {vehicles.length}</Text>
							<Text style={styles.infoLine}>Clusters activos: si</Text>

							<Pressable onPress={signOut} style={styles.logoutButton}>
								<Ionicons color="#ffffff" name="log-out-outline" size={18} />
								<Text style={styles.logoutText}>Cerrar sesion</Text>
							</Pressable>
						</View>
						) : null}
					</GlassCard>
				) : null}

				<View style={styles.bottomBar}>
					<Pressable onPress={() => setActiveTab('fleet')} style={[styles.tabButton, activeTab === 'fleet' && styles.tabButtonActive]}>
						<Ionicons color={activeTab === 'fleet' ? colors.primaryDark : colors.textMuted} name="map" size={20} />
						<Text style={[styles.tabText, activeTab === 'fleet' && styles.tabTextActive]}>Flota</Text>
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

function statusFromAlert(type?: string, fallback?: string): string {
	const normalized = (type || '').trim().toLowerCase();

	if (normalized === 'vehiculo detenido') {
		return 'stopped';
	}

	if (normalized === 'exceso de velocidad') {
		return 'overspeed';
	}

	if (normalized === 'boton de panico') {
		return 'panic';
	}

	return fallback || 'unknown';
}

function statusTone(status?: string): 'success' | 'warning' | 'danger' {
	const normalized = (status || '').toLowerCase();

	if (normalized === 'panic' || normalized === 'overspeed') {
		return 'danger';
	}

	if (normalized === 'stopped' || normalized === 'unknown') {
		return 'warning';
	}

	return 'success';
}

function alertTone(type?: string): 'success' | 'warning' | 'danger' {
	const normalized = (type || '').trim().toLowerCase();

	if (normalized.includes('panico') || normalized.includes('exceso')) {
		return 'danger';
	}

	if (normalized.includes('detenido') || normalized.includes('alerta')) {
		return 'warning';
	}

	return 'success';
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
		padding: 12,
		gap: 10
	},
	topRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: 8
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
	metricsRow: {
		flexDirection: 'row',
		gap: 8
	},
	metricCard: {
		flex: 1,
		borderRadius: 16,
		backgroundColor: 'rgba(255,255,255,0.8)',
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderColor: colors.border
	},
	metricLabel: {
		color: colors.textMuted,
		fontSize: 11,
		fontWeight: '700',
		textTransform: 'uppercase'
	},
	metricValue: {
		color: colors.text,
		fontSize: 22,
		fontWeight: '900',
		marginTop: 2
	},
	statusLine: {
		color: colors.textMuted,
		fontSize: 12,
		fontWeight: '600'
	},
	errorText: {
		color: colors.danger,
		fontSize: 12,
		fontWeight: '700'
	},
	markerWrap: {
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'visible'
	},
	marker: {
		width: 34,
		height: 34,
		borderRadius: 17,
		borderWidth: 2,
		borderColor: '#ffffff',
		alignItems: 'center',
		justifyContent: 'center'
	},
	markerSelected: {
		transform: [{ scale: 1.08 }],
		borderColor: '#0f172a'
	},
	clusterWrap: {
		minWidth: 52,
		height: 52,
		paddingHorizontal: 8,
		borderRadius: 26,
		borderWidth: 2,
		borderColor: '#ffffff',
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: 'rgba(15, 23, 42, 0.25)',
		shadowOpacity: 1,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
		elevation: 7
	},
	clusterText: {
		color: '#ffffff',
		fontSize: 16,
		lineHeight: 18,
		fontWeight: '900'
	},
	vehicleDetailOverlay: {
		position: 'absolute',
		left: 12,
		right: 12,
		zIndex: 30,
		elevation: 10
	},
	vehicleDetailCard: {
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
		minHeight: 220,
		maxHeight: 340
	},
	panelSection: {
		flex: 1
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
	sectionTitle: {
		color: colors.text,
		fontWeight: '800',
		fontSize: 16,
		marginBottom: 8
	},
	selectedVehicleCard: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 16,
		backgroundColor: '#ffffff',
		padding: 12,
		marginBottom: 8
	},
	selectedVehicleHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: 8,
		marginBottom: 6
	},
	selectedVehicleHeaderRight: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8
	},
	closeDetailButton: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: '#f1f5f9',
		alignItems: 'center',
		justifyContent: 'center'
	},
	selectedVehicleTitle: {
		color: colors.text,
		fontSize: 15,
		fontWeight: '800'
	},
	infoLine: {
		color: colors.text,
		fontWeight: '600',
		marginBottom: 4
	},
	list: {
		maxHeight: 190
	},
	vehicleMeta: {
		color: colors.textMuted,
		fontWeight: '600',
		marginTop: 4
	},
	alertItem: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 14,
		backgroundColor: '#ffffff',
		padding: 10,
		marginBottom: 8
	},
	alertHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: 8
	},
	alertType: {
		color: colors.text,
		fontSize: 14,
		fontWeight: '800'
	},
	alertDate: {
		color: colors.textMuted,
		marginTop: 6
	},
	alertHint: {
		color: colors.primaryDark,
		marginTop: 6,
		fontWeight: '700',
		fontSize: 11
	},
	empty: {
		color: colors.textMuted,
		fontWeight: '600'
	},
	logoutButton: {
		marginTop: 12,
		minHeight: 46,
		borderRadius: 999,
		backgroundColor: colors.primaryDark,
		alignItems: 'center',
		justifyContent: 'center',
		flexDirection: 'row',
		gap: 8
	},
	logoutText: {
		color: '#ffffff',
		fontWeight: '800'
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