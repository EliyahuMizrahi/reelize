import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AuthResponse, login, signUp } from '../services/api';

interface User {
  id: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signUp: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!accessToken;

  useEffect(() => {
    loadStoredTokens();
  }, []);

  const loadStoredTokens = async () => {
    try {
      const storedAccessToken = await AsyncStorage.getItem('accessToken');
      const storedRefreshToken = await AsyncStorage.getItem('refreshToken');
      const storedUser = await AsyncStorage.getItem('user');

      if (storedAccessToken && storedRefreshToken && storedUser) {
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error loading stored tokens:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const storeTokens = async (authResponse: AuthResponse) => {
    await AsyncStorage.setItem('accessToken', authResponse.data.AccessToken);
    await AsyncStorage.setItem('refreshToken', authResponse.data.RefreshToken);

    const tokenPayload = JSON.parse(atob(authResponse.data.AccessToken.split('.')[1]));
    const userData: User = {
      id: tokenPayload.id,
      username: tokenPayload.username,
    };

    await AsyncStorage.setItem('user', JSON.stringify(userData));

    setAccessToken(authResponse.data.AccessToken);
    setRefreshToken(authResponse.data.RefreshToken);
    setUser(userData);
  };

  const clearTokens = async () => {
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  const handleSignUp = async (username: string, password: string) => {
    const response = await signUp({ username, password });
    await storeTokens(response);
  };

  const handleLogin = async (username: string, password: string) => {
    const response = await login({ username, password });
    await storeTokens(response);
  };

  const handleLogout = async () => {
    await clearTokens();
    router.replace('/(auth)/sign-in' as any);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
      await AsyncStorage.setItem('user', JSON.stringify(updated));
    }
  };

  const value: AuthContextType = {
    user,
    accessToken,
    refreshToken,
    isLoading,
    isAuthenticated,
    signUp: handleSignUp,
    login: handleLogin,
    logout: handleLogout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
