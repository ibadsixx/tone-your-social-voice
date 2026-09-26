import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';

export interface SearchResult {
  id: string;
  name: string;
  type: 'person' | 'page' | 'group' | 'hashtag';
  avatar?: string;
  username?: string;
  tag?: string;
}

interface SearchResults {
  people: SearchResult[];
  pages: SearchResult[];
  groups: SearchResult[];
  hashtags: SearchResult[];
}

export const useSearch = (query: string, debounceMs: number = 300) => {
  const [results, setResults] = useState<SearchResults>({
    people: [],
    pages: [],
    groups: [],
    hashtags: []
  });
  const [exploreResults, setExploreResults] = useState<SearchResults>({
    people: [],
    pages: [],
    groups: [],
    hashtags: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExploreContent = useCallback(async () => {
    try {
      // People, pages, groups and hashtags are four independent tables and none
      // of these reads consumes another's result, so they used to cost four round
      // trips in a row. One parallel wave instead; error precedence is unchanged.
      const [profilesRes, pagesRes, groupsRes, hashtagsRes] = await Promise.all([
        // RLS automatically excludes blocked users
        gateway.from('profiles').select('id, display_name, username, profile_pic').limit(5),
        gateway.from('pages').select('id, name, description').limit(5),
        gateway.from('groups').select('id, name, description').limit(5),
        gateway.from('hashtags').select('id, tag, follower_count').order('follower_count', { ascending: false }).limit(5),
      ]);

      const { data: profiles, error: profilesError } = profilesRes;
      if (profilesError) throw profilesError;
      const { data: pages, error: pagesError } = pagesRes;
      if (pagesError) throw pagesError;
      const { data: groups, error: groupsError } = groupsRes;
      if (groupsError) throw groupsError;
      const { data: hashtags, error: hashtagsError } = hashtagsRes;
      if (hashtagsError) throw hashtagsError;

      // Transform results
      const exploreData: SearchResults = {
        people: profiles?.map(profile => ({
          id: profile.id,
          name: profile.display_name,
          username: profile.username,
          type: 'person' as const,
          avatar: profile.profile_pic
        })) || [],
        pages: pages?.map(page => ({
          id: page.id,
          name: page.name,
          type: 'page' as const,
          avatar: undefined
        })) || [],
        groups: groups?.map(group => ({
          id: group.id,
          name: group.name,
          type: 'group' as const,
          avatar: undefined
        })) || [],
        hashtags: hashtags?.map(hashtag => ({
          id: hashtag.id,
          name: `#${hashtag.tag}`,
          tag: hashtag.tag,
          type: 'hashtag' as const
        })) || []
      };

      setExploreResults(exploreData);
    } catch (err: any) {
      console.error('Explore content error:', err);
    }
  }, []);

  const searchDatabase = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults({ people: [], pages: [], groups: [], hashtags: [] });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Strip a leading "@" so typing @username matches purely on username.
      let term = searchQuery.trim();
      if (term.startsWith('@')) term = term.slice(1);
      const searchPattern = `%${term}%`;

      // Four independent tables again, and this one re-runs on every debounced
      // keystroke, so the serialised version cost ~1.2 s and ~168 KB of table
      // bodies per keystroke. One parallel wave; error precedence is unchanged.
      const [profilesRes, pagesRes, groupsRes, hashtagsRes] = await Promise.all([
        // RLS automatically excludes blocked users
        gateway
          .from('profiles')
          .select('id, display_name, username, profile_pic')
          .or(`display_name.ilike.${searchPattern},username.ilike.${searchPattern}`)
          .limit(20),
        gateway.from('pages').select('id, name, description').ilike('name', searchPattern).limit(5),
        gateway.from('groups').select('id, name, description').ilike('name', searchPattern).limit(5),
        gateway.from('hashtags').select('id, tag, follower_count').ilike('tag', searchPattern).limit(5),
      ]);

      const { data: profiles, error: profilesError } = profilesRes;
      if (profilesError) throw profilesError;
      const { data: pages, error: pagesError } = pagesRes;
      if (pagesError) throw pagesError;
      const { data: groups, error: groupsError } = groupsRes;
      if (groupsError) throw groupsError;
      const { data: hashtags, error: hashtagsError } = hashtagsRes;
      if (hashtagsError) throw hashtagsError;

      // Transform results
      const searchResults: SearchResults = {
        people: profiles?.map(profile => ({
          id: profile.id,
          name: profile.display_name,
          username: profile.username,
          type: 'person' as const,
          avatar: profile.profile_pic
        })) || [],
        pages: pages?.map(page => ({
          id: page.id,
          name: page.name,
          type: 'page' as const,
          avatar: undefined
        })) || [],
        groups: groups?.map(group => ({
          id: group.id,
          name: group.name,
          type: 'group' as const,
          avatar: undefined
        })) || [],
        hashtags: hashtags?.map(hashtag => ({
          id: hashtag.id,
          name: `#${hashtag.tag}`,
          tag: hashtag.tag,
          type: 'hashtag' as const
        })) || []
      };

      // Alphabetical ordering: as each character is typed the narrowed results
      // are listed A→Z, making the reduction predictable and scannable.
      for (const section of [
        searchResults.people,
        searchResults.pages,
        searchResults.groups,
        searchResults.hashtags
      ]) {
        section.sort((a, b) => a.name.localeCompare(b.name));
      }

      setResults(searchResults);
    } catch (err: any) {
      setError(err.message);
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load explore content on mount
  useEffect(() => {
    fetchExploreContent();
  }, [fetchExploreContent]);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchDatabase(query);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [query, searchDatabase, debounceMs]);

  const totalResults = results.people.length + results.pages.length + results.groups.length + results.hashtags.length;
  const totalExploreResults = exploreResults.people.length + exploreResults.pages.length + exploreResults.groups.length + exploreResults.hashtags.length;

  return {
    results,
    exploreResults,
    loading,
    error,
    totalResults,
    totalExploreResults
  };
};