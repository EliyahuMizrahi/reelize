const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export interface SignUpData {
  username: string;
  password: string;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface AuthResponse {
  data: {
    AccessToken: string;
    RefreshToken: string;
  };
  message: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {}
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function signUp(data: SignUpData): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function login(data: LoginData): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
