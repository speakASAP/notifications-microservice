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
  private readonly aiToken: string;
  private readonly pendingResolve = new Map<number, { escalationId: string; expiresAt: number }>();
  private readonly RESOLVE_NOTE_TIMEOUT_MS = 60_000;

  constructor(
    private readonly telegram: TelegramService,
    private readonly orchestrator: OrchestratorClient,
  ) {
    this.allowedChatId = process.env.TELEGRAM_CHAT_ID || '';
    this.aiUrl = process.env.AI_SERVICE_URL || 'http://ai-microservice:3380';
    this.aiToken = process.env.AI_SERVICE_TOKEN || '';
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
    let alertText = 'Done.';

    try {
      if (data.startsWith('esc:acknowledge:')) {
        const escalationId = data.slice('esc:acknowledge:'.length);
        await this.orchestrator.acknowledgeEscalation(escalationId);
        alertText = 'Acknowledged.';
        await this.reply(chatId, `Escalation acknowledged.`);
      } else if (data.startsWith('esc:resolve:')) {
        const escalationId = data.slice('esc:resolve:'.length);
        this.pendingResolve.set(chatId, {
          escalationId,
          expiresAt: Date.now() + this.RESOLVE_NOTE_TIMEOUT_MS,
        });
        alertText = 'Add a note below, or send /skip';
        await this.reply(chatId, `Resolving escalation <code>${escalationId}</code>.\n\nReply with a note for the AI (or send <code>/skip</code> to resolve without a note):`);
      } else {
        this.logger.warn(`Unknown callback_query data: ${data}`);
        alertText = 'Unknown action.';
      }
    } catch (err) {
      const status = (err as any)?.response?.status;
      if (status === 404) {
        alertText = 'Escalation not found (may already be resolved).';
      } else {
        this.logger.error('Callback action failed', err instanceof Error ? err.message : String(err));
        alertText = 'Action failed. Please try again.';
      }
    }

    // Always answer the callback query to dismiss Telegram's loading spinner
    await this.answerCallbackQuery(query.id, alertText);
  }

  private async answerCallbackQuery(queryId: string, text?: string): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const apiUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org/bot';
    if (!botToken) return;
    try {
      await axios.post(`${apiUrl}${botToken}/answerCallbackQuery`, {
        callback_query_id: queryId,
        text,
        show_alert: false,
      });
    } catch (err) {
      this.logger.warn('answerCallbackQuery failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async handleMessage(chatId: number, text: string): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this.pendingResolve) {
      if (now > entry.expiresAt) this.pendingResolve.delete(id);
    }
    const pending = this.pendingResolve.get(chatId);
    if (pending) {
      this.pendingResolve.delete(chatId);
      if (Date.now() > pending.expiresAt) {
        await this.reply(chatId, 'Resolve timed out. Please click the Resolve button again.');
        return;
      }
      const note = text === '/skip' ? undefined : text;
      try {
        await this.orchestrator.resolveEscalation(pending.escalationId, note);
        await this.reply(chatId, `Escalation resolved.${note ? `\n<i>Note saved: ${note}</i>` : ''}`);
      } catch (err) {
        const status = (err as any)?.response?.status;
        const msg = status === 404 ? 'Escalation not found.' : 'Resolve failed. Please try again.';
        await this.reply(chatId, msg);
      }
      return;
    }

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
    // With only one project, skip AI routing and use it directly
    if (projects.length === 1) {
      const project = projects[0];
      const title = text.length <= 80 ? text : text.slice(0, 77) + '...';
      return { projectId: project.id, projectSlug: project.slug, title, description: undefined };
    }

    // Build list showing both slug and name so AI can reference either
    const projectList = projects.map((p) => `slug="${p.slug}" name="${p.name}"`).join('; ');
    const prompt = `You are a task router. Given a user instruction and a list of projects, extract the target project slug and task title.

Projects (use the exact slug value): ${projectList}

User instruction: "${text}"

Respond with ONLY valid JSON (no markdown, no explanation):
{"project_slug":"<exact slug from list>","title":"<short task title>","description":"<optional detail or empty string>"}

If you cannot determine the project, respond: {"project_slug":null,"title":null,"description":null}`;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.aiToken) headers['Authorization'] = `Bearer ${this.aiToken}`;
      const { data } = await axios.post(
        `${this.aiUrl}/ai/complete`,
        { model_tier: 'free', user_prompt: prompt },
        { timeout: 15000, headers },
      );
      const raw: string = typeof data === 'string' ? data : (data.content ?? data.response ?? JSON.stringify(data));
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as { project_slug: string | null; title: string | null; description?: string };
      if (!parsed.title) return null;
      // Match by slug, or fall back to name match if AI returned the name instead of slug
      const project = projects.find((p) => p.slug === parsed.project_slug)
        ?? projects.find((p) => p.name === parsed.project_slug);
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
