import { cleanupOldAudioFiles } from '../services/voice.service.js';

const DAY_MS = 24 * 3600_000;
const AUDIO_MAX_AGE_DAYS = 30;

let timer: NodeJS.Timeout | null = null;

async function runCleanup() {
  try {
    const removed = await cleanupOldAudioFiles(AUDIO_MAX_AGE_DAYS);
    if (removed > 0) console.log(`[manutenção] ${removed} áudio(s) com mais de ${AUDIO_MAX_AGE_DAYS} dias removido(s)`);
  } catch (err: any) {
    console.error('[manutenção] falha ao limpar áudios:', err?.message);
  }
}

/** Limpeza diária de áudios (TTS e recebidos) com mais de 30 dias. Primeira execução 10 min após o boot. */
export function startMaintenanceWorker() {
  if (timer) return;
  const first = setTimeout(() => {
    void runCleanup();
    timer = setInterval(() => void runCleanup(), DAY_MS);
    timer.unref?.();
  }, 10 * 60_000);
  first.unref?.();
  timer = first;
}
