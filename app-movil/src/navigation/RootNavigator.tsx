import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { TelemetryScreen } from '../screens/TelemetryScreen';
import { colors } from '../theme/colors';

export type RootStackParamList = {
  Login: undefined;
  Telemetry: undefined;
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
        <Stack.Screen component={isAdmin ? AdminDashboardScreen : TelemetryScreen} name="Telemetry" />
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
