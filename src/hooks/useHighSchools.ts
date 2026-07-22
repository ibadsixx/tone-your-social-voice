import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';

export interface HighSchool {
  id: string;
  name: string;
}

export const useHighSchools = () => {
  const [highSchools, setHighSchools] = useState<HighSchool[]>([]);
  const [loading, setLoading] = useState(false);

  const searchHighSchools = async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setHighSchools([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await gateway
        .from('high_schools')
        .select('id, name')
        .ilike('name', `%${searchTerm}%`)
        .limit(10);

      if (error) throw error;
      setHighSchools(data || []);
    } catch (error) {
      console.error('Error searching high schools:', error);
      setHighSchools([]);
    } finally {
      setLoading(false);
    }
  };

  const createHighSchool = async (name: string): Promise<HighSchool | null> => {
    try {
      const { data, error } = await gateway
        .from('high_schools')
        .insert([{ name }])
        .select('id, name')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating high school:', error);
      return null;
    }
  };

  return {
    highSchools,
    loading,
    searchHighSchools,
    createHighSchool,
  };
};