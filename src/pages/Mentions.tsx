import { Link } from 'react-router-dom';
import { useMentionsFeed } from '@/hooks/useMentionsFeed';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { MentionText } from '@/components/MentionText';
import { formatDistanceToNow } from 'date-fns';
import { AtSign, MessageSquare, FileText } from 'lucide-react';
import PageContainer from '@/components/PageContainer';

const Mentions = () => {
  const { mentions, loading } = useMentionsFeed();

  if (loading) {
    return (
      <PageContainer size="sm">
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-tone-purple to-tone-blue bg-clip-text text-transparent">
          Mentions
        </h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <div className="flex gap-4">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  if (mentions.length === 0) {
    return (
      <PageContainer size="sm">
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-tone-purple to-tone-blue bg-clip-text text-transparent">
          Mentions
        </h1>
        <Card className="p-12 text-center">
          <AtSign className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No mentions yet</h3>
          <p className="text-muted-foreground">
            When someone mentions you in a post or comment, it will appear here.
          </p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="sm">
      <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-tone-purple to-tone-blue bg-clip-text text-transparent">
        Mentions
      </h1>
      
      <div className="space-y-4">
        {mentions.map((mention) => {
          const isPost = mention.source_type === 'post';
          const isTag = mention.source_type === 'tag';
          const content = isPost || isTag ? mention.post : mention.comment;
          const author = content?.author;

          if (!content || !author) return null;

          const linkTo = (isPost || isTag)
            ? `/post/${mention.source_id}`
            : `/post/${mention.comment?.post_id}`;

          return (
            <Link key={mention.id} to={linkTo}>
              <Card className="p-6 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex gap-4">
                  <Link
                    to={`/profile/${author.username}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  >
                    <Avatar className="w-12 h-12 border-2 border-tone-purple/20">
                      <AvatarImage src={author.profile_pic || '/default-avatar.png'} />
                      <AvatarFallback className="bg-tone-gradient text-white">
                        {author.display_name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Link
                        to={`/profile/${author.username}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold hover:underline"
                      >
                        {author.display_name}
                      </Link>
                      <span className="text-muted-foreground">
                        {isTag
                          ? 'tagged you in a post'
                          : `mentioned you in a ${isPost ? 'post' : 'comment'}`}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(mention.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    <div className="flex items-start gap-2">
                      {(isPost || isTag) ? (
                        <FileText className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />
                      ) : (
                        <MessageSquare className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />
                      )}
                      <div className="text-sm text-foreground/80 line-clamp-3">
                        <MentionText text={content.content || ''} />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      </PageContainer>
    );
  };
  
  export default Mentions;
