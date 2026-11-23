// Tone frontend — Infrastructure configuration startup hook.
//
// Loads the domain-project configuration registry during application
// initialization. Domain-dependent operations should not execute until this
// hook reports status 'ready'. Public application rendering should not be
// blocked by this hook; callers can gate domain-specific features on the
// ready state.

import { useState, useEffect } from 'react';
import { loadInfrastructureProjects, isInfrastructureConfigured } from '@/lib/supabase';
import type { InfrastructureProject, InfrastructureConfigError } from '@/lib/supabase';

export interface UseInfrastructureConfigResult {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: InfrastructureConfigError | null;
  projects: InfrastructureProject[];
  isLoaded: boolean;
  reload: () => Promise<void>;
}

export function useInfrastructureConfig(): UseInfrastructureConfigResult {
  const [state, setState] = useState<UseInfrastructureConfigResult>({
    status: 'idle',
    error: null,
    projects: [],
    isLoaded: false,
    reload: async () => {
      // noop until replaced in effect
    },
  });

  const reload = async (): Promise<void> => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const projects = await loadInfrastructureProjects();
      setState({
        status: 'ready',
        error: null,
        projects,
        isLoaded: true,
        reload,
      });
    } catch (err) {
      const error: InfrastructureConfigError =
        err instanceof Error
          ? { code: 'LOAD_ERROR', message: err.message, details: err }
          : { code: 'LOAD_ERROR', message: 'Unknown infrastructure load error', details: err };
      setState({
        status: 'error',
        error,
        projects: [],
        isLoaded: true,
        reload,
      });
    }
  };

  // Empty dependency array: this hook runs once on mount. `reload` and
  // `loadInfrastructureProjects` are stable (setState + module function), so
  // capturing them at mount time is safe.
  useEffect(() => {
    if (!isInfrastructureConfigured()) {
      setState({
        status: 'error',
        error: {
          code: 'INIT_ERROR',
          message:
            'Infrastructure Supabase is not configured. Set VITE_INFRA_SUPABASE_URL and VITE_INFRA_SUPABASE_ANON_KEY.',
        },
        projects: [],
        isLoaded: true,
        reload,
      });
      return;
    }

    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
