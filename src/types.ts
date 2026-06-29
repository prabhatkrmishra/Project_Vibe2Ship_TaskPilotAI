export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  deadline: string; // ISO date string
  priority: Priority;
  status: TaskStatus;
  category: string;
  estimatedHours: number;
  subtasks: Subtask[];
  createdAt: string;
  riskScore?: number;
  confidenceScore?: number;
}

export interface ScheduledSession {
  taskId: string;
  taskTitle: string;
  startTime: string; // ISO datetime
  endTime: string;   // ISO datetime
}

export interface DailyPlan {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  sessions: ScheduledSession[];
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface AIDecision {
  id: string;
  timestamp: string;
  title: string;
  reason: string;
}
