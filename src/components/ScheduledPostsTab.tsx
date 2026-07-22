import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Calendar, Clock, Edit3, Trash2, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { gateway } from '@/lib/gateway';
import SchedulePostModal from './SchedulePostModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ScheduledPost {
  id: string;
  content: string | null;
  scheduled_at: string;
  created_at: string;
  user_id: string;
  feeling_activity_emoji?: string | null;
  feeling_activity_text?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

const ScheduledPostsTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [deletingPost, setDeletingPost] = useState<ScheduledPost | null>(null);

  const fetchScheduledPosts = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('posts')
        .select(`
          *,
          profiles!posts_user_id_fkey (
            username,
            display_name,
            profile_pic
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      setScheduledPosts(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load scheduled posts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = async (newScheduledAt: Date) => {
    if (!editingPost) return;

    try {
      const { error } = await gateway
        .from('posts')
        .update({
          scheduled_at: newScheduledAt.toISOString()
        })
        .eq('id', editingPost.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Post rescheduled successfully'
      });

      setEditingPost(null);
      fetchScheduledPosts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to reschedule post',
        variant: 'destructive'
      });
    }
  };

  const handlePublishNow = async (post: ScheduledPost) => {
    try {
      const { error } = await gateway
        .from('posts')
        .update({
          status: 'published',
          created_at: new Date().toISOString(),
          scheduled_at: null
        })
        .eq('id', post.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Post published successfully'
      });

      fetchScheduledPosts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to publish post',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (post: ScheduledPost) => {
    try {
      const { error } = await gateway
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Scheduled post deleted'
      });

      setDeletingPost(null);
      fetchScheduledPosts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete post',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchScheduledPosts();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (scheduledPosts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Clock className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Scheduled Posts</h3>
        <p className="text-muted-foreground">Posts you schedule will appear here until they're published.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Scheduled Posts</h2>
        <Badge variant="secondary" className="text-xs">
          {scheduledPosts.length} scheduled
        </Badge>
      </div>

      <AnimatePresence>
        {scheduledPosts.map((post, index) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={post.profiles.profile_pic || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {post.profiles.display_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{post.profiles.display_name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>
                            Scheduled for {format(new Date(post.scheduled_at), 'MMM d, yyyy')} at{' '}
                            {format(new Date(post.scheduled_at), 'h:mm a')}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Scheduled
                      </Badge>
                    </div>

                    {post.content && (
                      <div className="text-sm text-foreground bg-muted/30 rounded-lg p-3">
                        {post.feeling_activity_emoji && post.feeling_activity_text && (
                          <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
                            <span>{post.feeling_activity_emoji}</span>
                            <span>{post.feeling_activity_text}</span>
                          </div>
                        )}
                        <p className="line-clamp-3">{post.content}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingPost(post);
                          setShowScheduleModal(true);
                        }}
                        className="text-xs"
                      >
                        <Edit3 className="w-3 h-3 mr-1" />
                        Reschedule
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePublishNow(post)}
                        className="text-xs"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Publish Now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingPost(post)}
                        className="text-xs text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Reschedule Modal */}
      <SchedulePostModal
        open={showScheduleModal}
        onOpenChange={setShowScheduleModal}
        onSchedule={handleReschedule}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingPost} onOpenChange={() => setDeletingPost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scheduled Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scheduled post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingPost && handleDelete(deletingPost)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ScheduledPostsTab;