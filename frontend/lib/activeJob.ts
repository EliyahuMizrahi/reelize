import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'reelize:active_job:v1';

export type ActiveJob = {
  jobId: string;
  url: string;
  startedAt: number;
};

export async function getActiveJob(): Promise<ActiveJob | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveJob;
    if (!parsed?.jobId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setActiveJob(job: ActiveJob): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(job));
  } catch {
    // best-effort; resume is a nice-to-have
  }
}

export async function clearActiveJob(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
