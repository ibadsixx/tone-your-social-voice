import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Search as SearchIcon, User, Users, FileText, Loader2, Grid3X3, Plus } from 'lucide-react';
import { useSearch, SearchResult } from '@/hooks/useSearch';
import { useExplorePosts } from '@/hooks/useExplorePosts';
import { supabase } from '@/integrations/supabase/client';
import ExplorePostGrid from '@/components/ExplorePostGrid';
import PostModal from '@/components/PostModal';
import { cn } from '@/lib/utils';

const Search = () => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  const { results, exploreResults, loading, error, totalResults, totalExploreResults } = useSearch(query);
  const { 
    posts: explorePosts, 
    loading: postsLoading, 
    hasMore, 
    loadMore, 
    refresh 
  } = useExplorePosts();

  // Create flat array for keyboard navigation
  const flatResults: (SearchResult & { section: string })[] = [
    ...results.people.map(r => ({ ...r, section: 'people' })),
    ...results.pages.map(r => ({ ...r, section: 'pages' })),
    ...results.groups.map(r => ({ ...r, section: 'groups' }))
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);
    setShowResults(value.trim().length > 0);
  };

  const saveSearchQuery = async (q: string) => {
    try {
      await supabase.rpc('add_search_entry', { p_query: q });
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
    }
    setShowResults(false);
    setQuery('');
  };

  const handlePostClick = (post: any) => {
    setSelectedPost(post);
    setIsPostModalOpen(true);
  };

  const handleClosePostModal = () => {
    setIsPostModalOpen(false);
    setSelectedPost(null);
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

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'person': return User;
      case 'page': return FileText;
      case 'group': return Users;
    }
  };

  const getResultLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'person': return 'Person';
      case 'page': return 'Page';
      case 'group': return 'Group';
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

  const ExploreSection = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Explore</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <Plus className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {postsLoading && explorePosts.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading posts...</span>
        </div>
      ) : explorePosts.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <Grid3X3 className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <h3 className="text-lg font-medium mb-2">No posts to explore</h3>
          <p>Check back later for new content</p>
        </div>
      ) : (
        <>
          <ExplorePostGrid 
            posts={explorePosts} 
            onPostClick={handlePostClick}
          />
          
          {hasMore && (
            <div className="text-center py-6">
              <Button 
                onClick={loadMore} 
                disabled={postsLoading}
                variant="outline"
              >
                {postsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );

  return (
    <>
      <div className="max-w-4xl mx-auto">
        <div className="relative" ref={resultsRef}>
          {/* Search Input - Fixed at top */}
          <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40 border-b px-6 py-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => query.trim().length > 0 && setShowResults(true)}
                placeholder="Search people, pages, and groups"
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
                    <ScrollArea className="max-h-96">
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
                          </div>
                        )}
                      </CardContent>
                    </ScrollArea>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Content Area */}
          <div className="px-6 py-4">
            <AnimatePresence mode="wait">
              {!showResults && !query && <ExploreSection />}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Post Modal */}
      <PostModal 
        post={selectedPost}
        isOpen={isPostModalOpen}
        onClose={handleClosePostModal}
      />
    </>
  );
};

export default Search;