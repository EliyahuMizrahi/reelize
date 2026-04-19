export type PendingUpload = {
  uri: string;
  name: string;
  type: string;
};

let pending: PendingUpload | null = null;

export function setPendingUpload(video: PendingUpload): void {
  pending = video;
}

export function takePendingUpload(): PendingUpload | null {
  const v = pending;
  pending = null;
  return v;
}

export function peekPendingUpload(): PendingUpload | null {
  return pending;
}

export function clearPendingUpload(): void {
  pending = null;
}
