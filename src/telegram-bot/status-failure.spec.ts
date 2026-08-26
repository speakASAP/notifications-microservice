import { TelegramBotService } from './telegram-bot.service';
import { OrchestratorClient } from './orchestrator.client';

/**
 * A failed orchestrator lookup must never render as "No recent tasks found."
 * An empty result and a failed lookup are different outcomes and the user has
 * to be able to tell them apart -- this is the failure mode that hid a broken
 * warehouse lane for 26 days.
 */
describe('TelegramBotService /status failure surfacing', () => {
  let service: TelegramBotService;
  let orchestrator: jest.Mocked<OrchestratorClient>;
  let replySpy: jest.SpyInstance;

  const statusUpdate = {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: 100, type: 'private' },
      from: { id: 100, is_bot: false, first_name: 'U' },
      text: '/status',
    },
  } as any;

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
    replySpy = jest.spyOn(service as any, 'reply').mockResolvedValue(undefined);
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
  });

  it('reports a lookup failure instead of an empty task list on 401', async () => {
    const err: any = new Error('Request failed with status code 401');
    err.response = { status: 401 };
    orchestrator.getRecentTasks.mockRejectedValue(err);

    await service.handleUpdate(statusUpdate);

    const sent = replySpy.mock.calls.map((c) => String(c[1])).join('\n');
    expect(sent).not.toMatch(/No recent tasks found/i);
    expect(sent).toMatch(/could not reach the orchestrator/i);
  });

  it('still reports a genuinely empty list as empty', async () => {
    orchestrator.getRecentTasks.mockResolvedValue([]);

    await service.handleUpdate(statusUpdate);

    const sent = replySpy.mock.calls.map((c) => String(c[1])).join('\n');
    expect(sent).toMatch(/No recent tasks found/i);
  });
});
