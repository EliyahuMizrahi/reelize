import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Noctis } from '@/components/brand/Noctis';
import { palette } from '@/constants/tokens';

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
      >
        <Noctis
          variant="watching"
          size={72}
          color={colors.text as string}
          eyeColor={palette.sage}
          animated
        />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <Redirect href="/splash" />;
}
