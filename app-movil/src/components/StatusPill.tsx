import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type StatusPillProps = {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  const toneStyle =
    tone === 'success'
      ? styles.success
      : tone === 'warning'
      ? styles.warning
      : tone === 'danger'
      ? styles.danger
      : styles.neutral;

  return (
    <View style={[styles.base, toneStyle]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  text: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
  },
  neutral: {
    backgroundColor: '#64748b'
  },
  success: {
    backgroundColor: colors.success
  },
  warning: {
    backgroundColor: colors.warning
  },
  danger: {
    backgroundColor: colors.danger
  }
});
