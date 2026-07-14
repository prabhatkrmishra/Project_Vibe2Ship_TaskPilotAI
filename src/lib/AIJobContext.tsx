import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';

export interface AIJob {
  id: string;
  label: string;
  startedAt: number;
}

interface AIJobContextValue {
  jobs: AIJob[];
  startJob: (id: string, label: string) => void;
  endJob: (id: string) => void;
  isJobRunning: (id: string) => boolean;
  planVersion: number;
  bumpPlanVersion: () => void;
}

const AIJobContext = createContext<AIJobContextValue | null>(null);

export function AIJobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const jobsRef = useRef<AIJob[]>([]);
  const [planVersion, setPlanVersion] = useState(0);

  const startJob = useCallback((id: string, label: string) => {
    const job: AIJob = { id, label, startedAt: Date.now() };
    jobsRef.current = [...jobsRef.current, job];
    setJobs([...jobsRef.current]);
  }, []);

  const endJob = useCallback((id: string) => {
    jobsRef.current = jobsRef.current.filter(j => j.id !== id);
    setJobs([...jobsRef.current]);
  }, []);

  const isJobRunning = useCallback((id: string) => {
    return jobsRef.current.some(j => j.id === id);
  }, []);

  const bumpPlanVersion = useCallback(() => {
    setPlanVersion(v => v + 1);
  }, []);

  return (
    <AIJobContext.Provider value={{ jobs, startJob, endJob, isJobRunning, planVersion, bumpPlanVersion }}>
      {children}
    </AIJobContext.Provider>
  );
}

export function useAIJobs() {
  const ctx = useContext(AIJobContext);
  if (!ctx) throw new Error('useAIJobs must be used within AIJobProvider');
  return ctx;
}
