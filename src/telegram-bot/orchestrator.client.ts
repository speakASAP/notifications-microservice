import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface OrchestratorProject {
  id: string;
  slug: string;
  name: string;
  status: string;
}

export interface OrchestratorGoal {
  id: string;
  title: string;
  status: string;
  projectId: string;
}

export interface OrchestratorTask {
  id: string;
  type: string;
  status: string;
  priority: number;
  project_id: string;
}

@Injectable()
export class OrchestratorClient {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(OrchestratorClient.name);

  constructor() {
    const baseURL = process.env.ORCHESTRATOR_URL || 'http://business-orchestrator:3390';
    const token = process.env.ORCHESTRATOR_SERVICE_TOKEN || '';
    this.http = axios.create({
      baseURL,
      timeout: 8000,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async findProjects(): Promise<OrchestratorProject[]> {
    const { data } = await this.http.get<OrchestratorProject[]>('/api/projects');
    return Array.isArray(data) ? data : [];
  }

  async createGoal(projectId: string, title: string, description?: string): Promise<OrchestratorGoal> {
    const { data } = await this.http.post<OrchestratorGoal>(`/api/projects/${projectId}/goals`, {
      title,
      description,
      priority: 3,
    });
    return data;
  }

  async acknowledgeEscalation(id: string): Promise<void> {
    await this.http.post(`/api/escalations/${id}/acknowledge`);
  }

  async resolveEscalation(id: string, note?: string): Promise<void> {
    await this.http.post(`/api/escalations/${id}/resolve`, { note });
  }

  async getRecentTasks(): Promise<OrchestratorTask[]> {
    try {
      const { data } = await this.http.get<OrchestratorTask[]>('/api/dashboard/tasks');
      return Array.isArray(data) ? data.slice(0, 10) : [];
    } catch {
      this.logger.warn('Failed to fetch recent tasks from orchestrator');
      return [];
    }
  }
}
