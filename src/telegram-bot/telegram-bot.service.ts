import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { TelegramService } from '../telegram/telegram.service';
import { OrchestratorClient, OrchestratorProject } from './orchestrator.client';
import { TelegramUpdate } from './dto/telegram-update.dto';

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly allowedChatId: string;
  private readonly aiUrl: string;

  constructor(
    private readonly telegram: TelegramService,
    private readonly orchestrator: OrchestratorClient,
  ) {
    this.allowedChatId = process.env.TELEGRAM_CHAT_ID || '';
    this.aiUrl = process.env.AI_SERVICE_URL || 'http://ai-microservice:3380';
  }

  isAuthorized(chatId: number | string): boolean {
    return !this.allowedChatId || String(chatId) === this.allowedChatId;
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query.from.id, update.callback_query);
        return;
      }
      if (update.message?.text) {
        await this.handleMessage(update.message.chat.id, update.message.text.trim());
      }
    } catch (err) {
      this.logger.error('Error handling Telegram update', err instanceof Error ? err.stack : String(err));
    }
  }

  private async handleCallbackQuery(
    chatId: number,
    query: NonNullable<TelegramUpdate['callback_query']>,
  ): Promise<void> {
    const data = query.data || '';

    if (data.startsWith('esc:acknowledge:')) {
      const escalationId = data.slice('esc:acknowledge:'.length);
      await this.orchestrator.acknowledgeEscalation(escalationId);
      await this.reply(chatId, `Escalation acknowledged.`);
      return;
    }

    if (data.startsWith('esc:resolve:')) {
      const escalationId = data.slice('esc:resolve:'.length);
      await this.orchestrator.resolveEscalation(escalationId);
      await this.reply(chatId, `Escalation resolved.`);
      return;
    }

    this.logger.warn(`Unknown callback_query data: ${data}`);
  }

  private async handleMessage(chatId: number, text: string): Promise<void> {
    if (text.startsWith('/status')) {
      await this.handleStatus(chatId);
      return;
    }

    if (text.startsWith('/help') || text === '/start') {
      await this.reply(
        chatId,
        `Commands:\n/status — recent tasks\n\nOr just type a task in plain text, e.g.:\n<i>Add a checkout button to the shop project</i>`,
      );
      return;
    }

    await this.handleFreeText(chatId, text);
  }

  private async handleStatus(chatId: number): Promise<void> {
    const tasks = await this.orchestrator.getRecentTasks();
    if (!tasks.length) {
      await this.reply(chatId, 'No recent tasks found.');
      return;
    }
    const lines = tasks.map(
      (t) => `• [${t.status}] <b>${t.type}</b> (priority ${t.priority})`,
    );
    await this.reply(chatId, `<b>Recent tasks:</b>\n${lines.join('\n')}`);
  }

  private async handleFreeText(chatId: number, text: string): Promise<void> {
    const projects = await this.orchestrator.findProjects();
    if (!projects.length) {
      await this.reply(chatId, 'No projects found in the orchestrator.');
      return;
    }

    const parsed = await this.parseIntent(text, projects);
    if (!parsed) {
      const projectList = projects.map((p) => `• ${p.slug} — ${p.name}`).join('\n');
      await this.reply(
        chatId,
        `Could not determine which project this is for. Available projects:\n${projectList}\n\nTry again including the project name.`,
      );
      return;
    }

    const goal = await this.orchestrator.createGoal(parsed.projectId, parsed.title, parsed.description);
    await this.reply(
      chatId,
      `Goal created in <b>${parsed.projectSlug}</b>:\n<i>${goal.title}</i>\nID: <code>${goal.id}</code>`,
    );
  }

  private async parseIntent(
    text: string,
    projects: OrchestratorProject[],
  ): Promise<{ projectId: string; projectSlug: string; title: string; description?: string } | null> {
    const projectList = projects.map((p) => `${p.slug} (name: "${p.name}")`).join(', ');
    const prompt = `You are a task router. Given a user instruction and a list of projects, extract the target project and task title.

Projects: ${projectList}

User instruction: "${text}"

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{"project_slug":"<slug from list>","title":"<short task title>","description":"<optional longer description or empty string>"}

If you cannot determine the project, respond: {"project_slug":null,"title":null,"description":null}`;

    try {
      const { data } = await axios.post(
        `${this.aiUrl}/ai/complete`,
        { model_tier: 'free', user_prompt: prompt },
        { timeout: 15000 },
      );
      const raw: string = typeof data === 'string' ? data : (data.content ?? data.response ?? JSON.stringify(data));
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as { project_slug: string | null; title: string | null; description?: string };
      if (!parsed.project_slug || !parsed.title) return null;
      const project = projects.find((p) => p.slug === parsed.project_slug);
      if (!project) return null;
      return {
        projectId: project.id,
        projectSlug: project.slug,
        title: parsed.title,
        description: parsed.description || undefined,
      };
    } catch (err) {
      this.logger.error('AI intent parsing failed', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private async reply(chatId: number, message: string): Promise<void> {
    await this.telegram.send({ chatId: String(chatId), message });
  }
}
