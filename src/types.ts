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
  goalId?: string | null;
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
  gamification?: GamificationState;
}

export interface GamificationState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  xp: number;
  level: number;
  totalTasksCompleted: number;
  onTimeTasksCompleted: number;
  earnedBadges: string[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  category: 'Streak' | 'Productivity' | 'Quality' | 'AI';
  criteria: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'streak_3', name: 'Getting Started', description: '3-day streak', icon: 'Flame', tier: 'Common', category: 'Streak', criteria: 3 },
  { id: 'streak_7', name: 'Week Warrior', description: '7-day streak', icon: 'Flame', tier: 'Rare', category: 'Streak', criteria: 7 },
  { id: 'streak_30', name: 'Monthly Master', description: '30-day streak', icon: 'Flame', tier: 'Epic', category: 'Streak', criteria: 30 },
  { id: 'streak_100', name: 'Centurion', description: '100-day streak', icon: 'Flame', tier: 'Legendary', category: 'Streak', criteria: 100 },
  { id: 'tasks_50', name: 'Task Master', description: '50 tasks completed', icon: 'CheckCircle', tier: 'Rare', category: 'Productivity', criteria: 50 },
  { id: 'tasks_500', name: 'Productivity Legend', description: '500 tasks completed', icon: 'CheckCircle', tier: 'Legendary', category: 'Productivity', criteria: 500 },
  { id: 'punctual_10', name: 'Punctual Planner', description: '10 tasks on time', icon: 'Clock', tier: 'Common', category: 'Quality', criteria: 10 },
  { id: 'deadline_50', name: 'Deadline Master', description: '50 tasks on time', icon: 'Clock', tier: 'Epic', category: 'Quality', criteria: 50 }
];

export interface AIDecision {
  id: string;
  timestamp: string;
  title: string;
  reason: string;
}

export interface GoalStep {
  id: string;
  title: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string;
  targetDate?: string; // ISO string for quests
  type: 'habit' | 'quest';
  progress: number; // 0-100 for quest, or completion count for habits
  streak?: number; // for habits
  steps?: GoalStep[];
  completed: boolean;
  createdAt: any;
}