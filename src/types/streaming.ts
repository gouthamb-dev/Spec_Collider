export interface StreamChunk {
  content: string;
  done: boolean;
  source: AgentRole;
  timestamp: number;
}

export type AgentRole = 'red_team_agent' | 'architect_agent' | 'spec_generator';
