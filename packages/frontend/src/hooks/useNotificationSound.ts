let audioContext: AudioContext | null = null;

function playBeep() {
  try {
    if (!audioContext) audioContext = new AudioContext();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    osc.stop(audioContext.currentTime + 0.3);
  } catch {
    // audio not supported
  }
}

export function useNotificationSound() {
  return { playBeep };
}
