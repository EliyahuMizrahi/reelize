import { Button } from '@/components/ui/Button';
import { Spacer } from '@/components/ui/Spacer';
import { TextField } from '@/components/ui/TextField';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, Alert } from 'react-native';

export default function SignInScreen() {
  const { colors } = useAppTheme();
  const { login } = useAuth();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!username.trim() || !password.trim()) {
      if (isWeb) {
        alert('Please fill in all fields');
      } else {
        Alert.alert('Error', 'Please fill in all fields');
      }
      return;
    }

    setIsLoading(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)/tab1' as any);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      if (isWeb) {
        alert(`Login Failed: ${errorMessage}`);
      } else {
        Alert.alert('Login Failed', errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevSkip = () => {
    router.replace('/(tabs)/tab1' as any);
  };

  const LogoPlaceholder = () => (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.mutedText as string,
        backgroundColor: colors.border as string,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: colors.mutedText as string, fontSize: 8, fontWeight: '600' }}>
        48×48
      </Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} style={{ backgroundColor: isWeb ? colors.card as string : colors.background as string }}>

      {isWeb && (
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LogoPlaceholder />
            <Text
              style={{
                marginLeft: 12,
                color: colors.text as string,
                fontSize: 28,
                fontWeight: '800'
              }}
            >
              App
            </Text>
          </View>
        </View>
      )}

      <View style={{
        width: '100%',
        padding: 24,
        ...(isWeb && {
          maxWidth: 400,
          alignSelf: 'center',
          borderRadius: 12,
          margin: 20,
        })
      }}>

        {!isWeb && (
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LogoPlaceholder />
              <Text
                style={{
                  marginLeft: 12,
                  color: colors.text as string,
                  fontSize: 28,
                  fontWeight: '800'
                }}
              >
                App
              </Text>
            </View>
          </View>
        )}

        <Text style={{ color: colors.text as string, fontWeight: '800', fontSize: 24, marginBottom: 20 }}>
          Log in
        </Text>

        <TextField
          label="Username"
          placeholder="Enter your username"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <Spacer size={18} />
        <TextField
          label="Password"
          placeholder="Enter your password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Spacer size={16} />

        <Button
          title={isLoading ? "Signing In..." : "Sign In"}
          onPress={handleSignIn}
          disabled={isLoading}
        />

        <Spacer size={12} />

        {/* DEV ONLY — remove before production */}
        <Pressable
          onPress={handleDevSkip}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: '#f59e0b',
            backgroundColor: pressed ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.08)',
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignItems: 'center',
          })}
        >
          <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
            DEV: SKIP LOGIN →
          </Text>
        </Pressable>

        <Spacer size={20} />
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Text style={{ color: colors.mutedText as string }}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Text style={{ color: colors.primary as string, fontWeight: '700' }}>Sign Up</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}


