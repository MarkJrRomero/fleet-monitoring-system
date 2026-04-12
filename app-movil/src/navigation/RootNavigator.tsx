import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { DriverAlertsScreen } from '../screens/DriverAlertsScreen';
import { TelemetryScreen as DriverMapScreen } from '../screens/DriverMapScreen';
import { DriverProfileScreen } from '../screens/DriverProfileScreen';
import { DriverSimulatorScreen } from '../screens/DriverSimulatorScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { colors } from '../theme/colors';

export type RootStackParamList = {
  Login: undefined;
  Telemetry: undefined;
  DriverSimulator: undefined;
  DriverAlerts: undefined;
  DriverProfile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { loading, session } = useAuth();
  const isAdmin = Boolean(Array.isArray(session?.roles) && session?.roles.includes('admin'));

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session ? (
        isAdmin ? (
          <Stack.Screen component={AdminDashboardScreen} name="Telemetry" />
        ) : (
          <>
            <Stack.Screen component={DriverMapScreen} name="Telemetry" />
            <Stack.Screen component={DriverSimulatorScreen} name="DriverSimulator" />
            <Stack.Screen component={DriverAlertsScreen} name="DriverAlerts" />
            <Stack.Screen component={DriverProfileScreen} name="DriverProfile" />
          </>
        )
      ) : (
        <Stack.Screen component={LoginScreen} name="Login" />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  }
});
