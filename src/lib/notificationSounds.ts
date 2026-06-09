let notificationSoundEnabled = true;
let doNotDisturbUntil: string | null = null;

export function setNotificationSoundEnabled(enabled: boolean) {
  notificationSoundEnabled = enabled;
}

export function setDoNotDisturbUntil(until: string | null) {
  doNotDisturbUntil = until;
}

export function playMessageNotification() {
  if (doNotDisturbUntil) {
    const untilTime = new Date(doNotDisturbUntil).getTime();
    if (Date.now() < untilTime) return;
  }
  if (!notificationSoundEnabled) return;
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {}
}
