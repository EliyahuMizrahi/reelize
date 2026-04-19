import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Platform, View } from 'react-native';
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
    // On mobile, the `feed` tab is hidden (href: null in (tabs)/_layout.tsx),
    // so redirecting there lands on a tab that doesn't exist. Route both
    // platforms to library — that's the "home" shelf intent.
    return <Redirect href="/(tabs)/library" />;
  }

  // Splash / intro screen is mobile-only. Web users land straight on sign-up.
  return <Redirect href={Platform.OS === 'web' ? '/(auth)/sign-up' : '/splash'} />;
}
