import { useState } from 'react';
import { gateway } from '@/lib/gateway';

export interface Company {
  id: string;
  name: string;
  type: string;
}

export const useCompanyOperations = () => {
  const [loading, setLoading] = useState(false);

  const getAllCompanies = async (): Promise<Company[]> => {
    setLoading(true);
    try {
      const { data, error } = await gateway
        .from('companies')
        .select('id, name, type')
        .order('name');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching companies:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const searchCompanies = async (query: string): Promise<Company[]> => {
    if (!query || query.length < 2) {
      return [];
    }

    setLoading(true);
    try {
      const trimmedQuery = query.trim().toLowerCase();
      const { data, error } = await gateway
        .from('companies')
        .select('id, name, type')
        .ilike('name', `%${trimmedQuery}%`)
        .limit(8);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching companies:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createCompany = async (name: string, type: string): Promise<Company | null> => {
    try {
      const { data, error } = await gateway
        .from('companies')
        .insert({
          name: name.trim(),
          type
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating company:', error);
      return null;
    }
  };

  const getCompanyById = async (id: string): Promise<Company | null> => {
    if (!id) return null;

    try {
      const { data, error } = await gateway
        .from('companies')
        .select('id, name, type')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching company:', error);
      return null;
    }
  };

  return {
    getAllCompanies,
    searchCompanies,
    createCompany,
    getCompanyById,
    loading
  };
};