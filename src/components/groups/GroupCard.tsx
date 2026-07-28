import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, UserMinus, Settings, FileText, Lock, Globe, EyeOff } from 'lucide-react';
import { Group } from '@/hooks/useGroups';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface GroupCardProps {
  group: Group;
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  showManageButtons?: boolean;
}

export const GroupCard = ({ group, onJoin, onLeave, showManageButtons }: GroupCardProps) => {
  const navigate = useNavigate();
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
      <Card className="h-full hover:shadow-elegant transition-shadow duration-300">
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