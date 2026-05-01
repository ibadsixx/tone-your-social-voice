import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, TrendingUp, Clock, Heart, User, Loader2 } from 'lucide-react';
import { usePages, Page } from '@/hooks/usePages';
import { PageCard } from '@/components/PageCard';
import { CreatePageDialog } from '@/components/CreatePageDialog';
import { motion } from 'framer-motion';

const Pages = () => {
  const [activeTab, setActiveTab] = useState('suggested');
  const [pages, setPages] = useState<Page[]>([]);
  const { loading, fetchPages, followPage, unfollowPage } = usePages();

  const loadPages = async (type: 'suggested' | 'interactive' | 'new' | 'following' | 'owned') => {
    const data = await fetchPages(type);
    setPages(data);
  };

  useEffect(() => {
    loadPages(activeTab as any);
  }, [activeTab]);

  const handleFollow = async (pageId: string) => {
    await followPage(pageId);
    loadPages(activeTab as any);
  };

  const handleUnfollow = async (pageId: string) => {
    await unfollowPage(pageId);
    loadPages(activeTab as any);
  };

  const handlePageCreated = () => {
    if (activeTab === 'owned') {
      loadPages('owned');
    } else {
      setActiveTab('owned');
    }
  };

  const EmptyState = ({ icon: Icon, title, description }: { 
    icon: React.ComponentType<any>, 
    title: string, 
    description: string 
  }) => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center py-12"
    >
      <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </motion.div>
  );

  const LoadingState = () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pages</h1>
            <p className="text-muted-foreground">Discover and follow pages that interest you</p>
          </div>
        </div>
        <CreatePageDialog onPageCreated={handlePageCreated} />
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="suggested" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">Suggested</span>
          </TabsTrigger>
          <TabsTrigger value="interactive" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Most Active</span>
          </TabsTrigger>
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </TabsTrigger>
          <TabsTrigger value="following" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Following</span>
          </TabsTrigger>
          <TabsTrigger value="owned" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Your Pages</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggested" className="space-y-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-xl font-semibold mb-4">Suggested Pages</h2>
            <p className="text-muted-foreground mb-6">
              Discover pages based on your interests and activity
            </p>
            
            {loading ? (
              <LoadingState />
            ) : pages.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="No suggestions yet"
                description="Start following pages and interacting with content to get personalized suggestions!"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pages.map((page) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                    loading={loading}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>

        <TabsContent value="interactive" className="space-y-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-xl font-semibold mb-4">Most Active Pages</h2>
            <p className="text-muted-foreground mb-6">
              Pages with the highest engagement and activity
            </p>
            
            {loading ? (
              <LoadingState />
            ) : pages.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No active pages yet"
                description="Active pages will appear here as they gain engagement!"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pages.map((page) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                    loading={loading}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>

        <TabsContent value="new" className="space-y-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-xl font-semibold mb-4">New Pages</h2>
            <p className="text-muted-foreground mb-6">
              Recently created pages in the community
            </p>
            
            {loading ? (
              <LoadingState />
            ) : pages.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No new pages"
                description="New pages will appear here as they're created!"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pages.map((page) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                    loading={loading}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>

        <TabsContent value="following" className="space-y-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-xl font-semibold mb-4">Pages You Follow</h2>
            <p className="text-muted-foreground mb-6">
              Pages you're currently following
            </p>
            
            {loading ? (
              <LoadingState />
            ) : pages.length === 0 ? (
              <EmptyState
                icon={User}
                title="Not following any pages yet"
                description="Start following pages to see them here!"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pages.map((page) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                    variant="following"
                    loading={loading}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>

        <TabsContent value="owned" className="space-y-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-xl font-semibold mb-4">Your Pages</h2>
            <p className="text-muted-foreground mb-6">
              Pages you've created and manage
            </p>
            
            {loading ? (
              <LoadingState />
            ) : pages.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="You haven't created any pages yet"
                description="Create your first page to start building your community!"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pages.map((page) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                    variant="owned"
                    loading={loading}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Pages;