import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Sparkles, TrendingUp, Calendar, UserCheck, Crown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGroups } from '@/hooks/useGroups';
import { GroupCard } from '@/components/groups/GroupCard';
import { CreateGroupDialog } from '@/components/groups/CreateGroupDialog';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/PageContainer';

// The page title, subtitle, create-group button and the tab bar are all static or
// viewer-only state, so none of them needs the group list. The list itself is
// shown as a skeleton grid while it loads, instead of the whole page collapsing
// into a spinner.
const GroupGridSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Loading groups">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="rounded-xl border border-border/50 bg-card/60 p-5 space-y-3">
        <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-full rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    ))}
  </div>
);

const Groups = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    loading,
    joinGroup,
    leaveGroup,
    createGroup,
    getSuggestedGroups,
    getNewGroups,
    getMostActiveGroups,
    getJoinedGroups,
    getManagedGroups
  } = useGroups();

  const suggestedGroups = getSuggestedGroups();
  const newGroups = getNewGroups();
  const activeGroups = getMostActiveGroups();
  const joinedGroups = getJoinedGroups();
  const managedGroups = getManagedGroups();
  const isGuest = !user;
  const handleJoin = isGuest ? () => navigate('/auth') : joinGroup;

  return (
    <PageContainer size="xl" className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Groups</h1>
            <p className="text-muted-foreground">Connect with like-minded people</p>
          </div>
        </div>
        {user ? (
          <CreateGroupDialog onCreateGroup={createGroup} />
        ) : (
          <Button onClick={() => navigate('/auth')}>Sign in to create a group</Button>
        )}
      </motion.div>

      <Tabs defaultValue="suggested" className="w-full">
        <TabsList className="w-full justify-start mb-6">
          <TabsTrigger value="suggested" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Suggested
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Most Active
          </TabsTrigger>
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            New
          </TabsTrigger>
          <TabsTrigger value="joined" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            {isGuest ? 'Sign in to see joined' : `Joined (${joinedGroups.length})`}
          </TabsTrigger>
          <TabsTrigger value="managed" className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            {isGuest ? 'Sign in to see your groups' : `Your Groups (${managedGroups.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggested" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Suggested Groups</h2>
          </div>
          {loading ? (
            <GroupGridSkeleton />
          ) : suggestedGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestedGroups.map((group, index) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GroupCard
                    group={group}
                    onJoin={handleJoin}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No suggested groups available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Most Active Groups</h2>
          </div>
          {loading ? (
            <GroupGridSkeleton />
          ) : activeGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGroups.map((group, index) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GroupCard
                    group={group}
                    onJoin={handleJoin}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No active groups available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="new" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">New Groups</h2>
          </div>
          {loading ? (
            <GroupGridSkeleton />
          ) : newGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {newGroups.map((group, index) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GroupCard
                    group={group}
                    onJoin={handleJoin}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No new groups available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="joined" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Your Joined Groups</h2>
          </div>
          {loading ? (
            <GroupGridSkeleton />
          ) : joinedGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {joinedGroups.map((group, index) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GroupCard
                    group={group}
                    onLeave={leaveGroup}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">You haven't joined any groups yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Explore suggested groups to get started!
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="managed" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Crown className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Groups You Manage</h2>
          </div>
          {loading ? (
            <GroupGridSkeleton />
          ) : managedGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {managedGroups.map((group, index) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GroupCard
                    group={group}
                    showManageButtons
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Crown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">You don't manage any groups yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Create your first group to start building a community!
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};

export default Groups;