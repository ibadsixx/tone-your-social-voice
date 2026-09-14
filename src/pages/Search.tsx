import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Search as SearchIcon, User, Users, FileText, Loader2, Hash } from 'lucide-react';
import { useSearch, SearchResult } from '@/hooks/useSearch';
import { gateway } from '@/lib/gateway';
import { ExploreSection } from '@/components/explore/ExploreSection';
import { cn } from '@/lib/utils';
import PageContainer from '@/components/PageContainer';

const Search = () => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  const { results, loading, error, totalResults } = useSearch(query, 150);

  // Create flat array for keyboard navigation
  const flatResults: (SearchResult & { section: string })[] = [
    ...results.people.map(r => ({ ...r, section: 'people' })),
    ...results.pages.map(r => ({ ...r, section: 'pages' })),
    ...results.groups.map(r => ({ ...r, section: 'groups' })),
    ...results.hashtags.map(r => ({ ...r, section: 'hashtags' }))
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);
    setShowResults(value.trim().length > 0);
  };

  const saveSearchQuery = async (q: string) => {
    try {
      await gateway.rpc('add_search_entry', { p_query: q });
    } catch {
      // silently fail — search history is non-critical
    }
  };

  const handleResultClick = (result: SearchResult) => {
    saveSearchQuery(query);
    switch (result.type) {
      case 'person':
        navigate(`/profile/${result.username}`);
        break;
      case 'page':
        navigate(`/pages/${result.id}`);
        break;
      case 'group':
        navigate(`/groups/${result.id}`);
        break;
      case 'hashtag':
        navigate(`/hashtag/${result.tag}`);
        break;
    }
    setShowResults(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || totalResults === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < flatResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && flatResults[selectedIndex]) {
          handleResultClick(flatResults[selectedIndex]);
        } else if (query.trim()) {
          saveSearchQuery(query.trim());
        }
        break;
      case 'Escape':
        setShowResults(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle clicks outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getResultLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'person': return 'Person';
      case 'page': return 'Page';
      case 'group': return 'Group';
      case 'hashtag': return 'Hashtag';
    }
  };

  const ResultItem = ({ 
    result, 
    isSelected, 
    onClick 
  }: { 
    result: SearchResult; 
    isSelected?: boolean; 
    onClick: () => void;
  }) => (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors",
        "hover:bg-accent/50",
        isSelected && "bg-accent"
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={result.avatar} />
        <AvatarFallback className="text-xs">
          {result.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{result.name}</p>
        {result.username && (
          <p className="text-xs text-muted-foreground truncate">@{result.username}</p>
        )}
        <p className="text-xs text-muted-foreground">{getResultLabel(result.type)}</p>
      </div>
    </div>
  );

  const ResultSection = ({ 
    title, 
    results: sectionResults, 
    icon: Icon,
    isSearch = false
  }: { 
    title: string; 
    results: SearchResult[]; 
    icon: React.ComponentType<any>;
    isSearch?: boolean;
  }) => {
    if (sectionResults.length === 0) return null;

    return (
      <>
        <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        {sectionResults.map((result, index) => {
          const flatIndex = isSearch ? flatResults.findIndex(r => r.id === result.id && r.type === result.type) : -1;
          const isSelected = flatIndex === selectedIndex;
          
          return (
            <ResultItem
              key={`${result.type}-${result.id}`}
              result={result}
              isSelected={isSelected}
              onClick={() => handleResultClick(result)}
            />
          );
        })}
        <Separator className="my-1" />
      </>
    );
  };

  return (
    <>
      <PageContainer size="md">
        <div className="relative" ref={resultsRef}>
          {/* Search Input - Fixed at top */}
          <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40 -mx-4 md:-mx-6 border-b px-4 md:px-6 py-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => query.trim().length > 0 && setShowResults(true)}
                placeholder="Search people, pages, groups, and hashtags"
                className="pl-10 text-base h-12 rounded-xl bg-muted/50 border-0"
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search Results Dropdown */}
            <AnimatePresence>
              {showResults && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="absolute top-full left-0 right-0 mt-2 z-50 border shadow-lg">
                      <div className="max-h-96 overflow-y-auto">
                        <CardContent className="p-0">
                        {loading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">Searching...</span>
                          </div>
                        ) : error ? (
                          <div className="p-4 text-center text-destructive">
                            <p>Error searching: {error}</p>
                          </div>
                        ) : totalResults === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <SearchIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No results found</p>
                            <p className="text-sm">Try different keywords</p>
                          </div>
                        ) : (
                          <div className="py-2">
                            <ResultSection 
                              title="People" 
                              results={results.people} 
                              icon={User}
                              isSearch={true}
                            />
                            <ResultSection 
                              title="Pages" 
                              results={results.pages} 
                              icon={FileText}
                              isSearch={true}
                            />
                            <ResultSection 
                              title="Groups" 
                              results={results.groups} 
                              icon={Users}
                              isSearch={true}
                            />
                            <ResultSection 
                              title="Hashtags" 
                              results={results.hashtags} 
                              icon={Hash}
                              isSearch={true}
                            />
                          </div>
                        )}
                      </CardContent>
                      </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Content Area - Explore grid below search bar when no query */}
          <div className="py-4">
            <AnimatePresence mode="wait">
              {!showResults && !query && <ExploreSection />}
            </AnimatePresence>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default Search;