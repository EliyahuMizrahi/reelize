import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors } = useAppTheme();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background as string,
        }}
      />
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/library" />;
  }

  return <Redirect href="/(auth)/sign-up" />;
}
