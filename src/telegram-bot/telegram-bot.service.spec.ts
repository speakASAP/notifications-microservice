import { TelegramBotService } from './telegram-bot.service';
import { OrchestratorClient } from './orchestrator.client';

describe('TelegramBotService note-capture', () => {
  let service: TelegramBotService;
  let orchestrator: jest.Mocked<OrchestratorClient>;

  beforeEach(() => {
    orchestrator = {
      resolveEscalation: jest.fn().mockResolvedValue(undefined),
      findProjects: jest.fn().mockResolvedValue([]),
      createGoal: jest.fn().mockResolvedValue({ id: 'g1', title: 't', status: 'active', projectId: 'p1' }),
      acknowledgeEscalation: jest.fn().mockResolvedValue(undefined),
      getRecentTasks: jest.fn().mockResolvedValue([]),
    } as any;
    const telegram = { send: jest.fn().mockResolvedValue(undefined) } as any;
    service = new TelegramBotService(telegram, orchestrator);
  });

  it('stores pending resolve on esc:resolve: callback and sends prompt', async () => {
    const replySpy = jest.spyOn(service as any, 'reply').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'answerCallbackQuery').mockResolvedValue(undefined);

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'cq1',
        from: { id: 100, is_bot: false, first_name: 'U' },
        data: 'esc:resolve:esc-abc',
      },
    });

    expect(replySpy).toHaveBeenCalledWith(100, expect.stringContaining('/skip'));
    expect(orchestrator.resolveEscalation).not.toHaveBeenCalled();
  });

  it('resolves with note on next non-skip message', async () => {
    jest.spyOn(service as any, 'reply').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'answerCallbackQuery').mockResolvedValue(undefined);

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'cq1',
        from: { id: 100, is_bot: false, first_name: 'U' },
        data: 'esc:resolve:esc-abc',
      },
    });

    await service.handleUpdate({
      update_id: 2,
      message: {
        message_id: 1,
        chat: { id: 100, type: 'private' },
        date: Date.now(),
        text: 'Check Redis config',
      },
    });

    expect(orchestrator.resolveEscalation).toHaveBeenCalledWith('esc-abc', 'Check Redis config');
  });

  it('resolves without note when /skip sent', async () => {
    jest.spyOn(service as any, 'reply').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'answerCallbackQuery').mockResolvedValue(undefined);

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'cq1',
        from: { id: 100, is_bot: false, first_name: 'U' },
        data: 'esc:resolve:esc-abc',
      },
    });

    await service.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 100, type: 'private' },
        date: Date.now(),
        text: '/skip',
      },
    });

    expect(orchestrator.resolveEscalation).toHaveBeenCalledWith('esc-abc', undefined);
  });
});
