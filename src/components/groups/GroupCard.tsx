import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, UserMinus, Settings, FileText, Lock, Globe, EyeOff } from 'lucide-react';
import { Group } from '@/hooks/useGroups';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface GroupCardProps {
  group: Group;
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  showManageButtons?: boolean;
}

export const GroupCard = ({ group, onJoin, onLeave, showManageButtons }: GroupCardProps) => {
  const navigate = useNavigate();
  // A stored URL that no longer resolves must fall back to the neutral cover
  // instead of a broken-image icon.
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = !!group.cover_image && !coverFailed;

  const handleJoinClick = () => {
    if (onJoin) onJoin(group.id);
  };

  const handleLeaveClick = () => {
    if (onLeave) onLeave(group.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="h-full overflow-hidden hover:shadow-elegant transition-shadow duration-300">
        <div className="relative h-28 w-full overflow-hidden bg-muted sm:h-32">
          {showCover ? (
            <img
              src={group.cover_image as string}
              alt={`${group.name} cover`}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-muted to-muted"
              aria-hidden="true"
            >
              <Users className="h-8 w-8 text-primary/40" />
            </div>
          )}
        </div>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3
                className="font-semibold text-lg mb-1 line-clamp-1 cursor-pointer hover:underline"
                onClick={() => navigate(`/groups/${group.id}`)}
              >
                {group.name}
              </h3>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                <span>{group.member_count || 0} members</span>
                <span className="text-muted-foreground">·</span>
                {group.privacy === 'private' ? (
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    <span>Private</span>
                  </span>
                ) : group.privacy === 'closed' ? (
                  <span className="flex items-center gap-1">
                    <EyeOff className="h-3 w-3" />
                    <span>Closed</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    <span>Public</span>
                  </span>
                )}
                {group.is_member && group.role && (
                  <Badge variant="secondary" className="text-xs">
                    {group.role}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pb-3">
          {group.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {group.description}
            </p>
          )}
        </CardContent>

        <CardFooter className="pt-3 border-t">
          <div className="flex gap-2 w-full">
            {!group.is_member ? (
              <Button 
                onClick={handleJoinClick}
                className="flex-1"
                size="sm"
              >
                Join Group
              </Button>
            ) : (
              <>
                {showManageButtons && group.role === 'admin' ? (
                  <>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Settings className="h-4 w-4 mr-1" />
                      Manage
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <FileText className="h-4 w-4 mr-1" />
                      Post
                    </Button>
                  </>
                ) : (
                  <Button 
                    onClick={handleLeaveClick}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <UserMinus className="h-4 w-4 mr-1" />
                    Leave
                  </Button>
                )}
              </>
            )}
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
};