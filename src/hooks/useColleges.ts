import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';

export interface College {
  id: string;
  name: string;
}

export const useColleges = () => {
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchColleges();
  }, []);

  const fetchColleges = async () => {
    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('colleges')
        .select('id, name')
        .order('name');

      if (error) throw error;

      setColleges(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return {
    colleges,
    loading,
    error,
    refetch: fetchColleges,
  };
};