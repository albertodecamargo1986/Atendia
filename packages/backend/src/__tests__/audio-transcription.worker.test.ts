import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mocks } = vi.hoisted(() => ({
  mockPrisma: { message: { findFirst: vi.fn(), update: vi.fn() } },
  mocks: { transcribeAudio: vi.fn(), scheduleAiResponse: vi.fn(), emit: vi.fn() },
}));

vi.mock('bullmq', () => ({ Worker: vi.fn(() => ({ on: vi.fn() })) }));
vi.mock('../lib/redis.js', () => ({ default: {} }));
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: mocks.emit }) }) }));
vi.mock('../services/voice.service.js', () => ({ transcribeAudio: mocks.transcribeAudio }));
vi.mock('../lib/ai-schedule.js', () => ({ scheduleAiResponse: mocks.scheduleAiResponse }));

import { processAudioTranscriptionJob } from '../workers/audio-transcription.worker.js';

const data = { tenantId: 't1', conversationId: 'cv1', messageId: 'm1', filePath: '/x/a.ogg', scheduleAi: true };

describe('transcrição de áudio em job (fora do handler do Baileys)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'm1', metadata: { audioUrl: '/uploads/t1/audio/a.ogg' } });
    mockPrisma.message.update.mockImplementation(async ({ data: d }: any) => ({ id: 'm1', ...d }));
  });

  it('transcreve, atualiza a mensagem e só então agenda a IA', async () => {
    mocks.transcribeAudio.mockResolvedValue(' quero um orçamento ');
    await processAudioTranscriptionJob({ data } as any);
    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { content: '[Áudio] quero um orçamento', metadata: { audioUrl: '/uploads/t1/audio/a.ogg', audioTranscribed: true } },
    });
    expect(mocks.scheduleAiResponse).toHaveBeenCalledWith({ tenantId: 't1', conversationId: 'cv1', triggerMessageId: 'm1' }, 1500);
    expect(mocks.transcribeAudio.mock.invocationCallOrder[0]).toBeLessThan(mocks.scheduleAiResponse.mock.invocationCallOrder[0]);
  });

  it('falha na transcrição: mantém "[Áudio]" e não quebra o fluxo', async () => {
    mocks.transcribeAudio.mockRejectedValue(new Error('sem chave'));
    await processAudioTranscriptionJob({ data: { ...data, scheduleAi: false } } as any);
    expect(mockPrisma.message.update.mock.calls[0][0].data.content).toBe('[Áudio]');
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
  });
});
