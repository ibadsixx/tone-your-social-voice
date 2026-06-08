import { Bell, Check, Loader2, Heart, MessageCircle, AtSign, UserPlus, Tag, RefreshCw, FileText, Users, Hand, Hash, Mail, Handshake, ShieldCheck, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export const NotificationsDropdown = () => {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: any) => {
    markAsRead(notification.id);

    if (notification.post_id) {
      navigate(`/post/${notification.post_id}`);
    } else if (notification.type === 'follow' && notification.actor) {
      navigate(`/profile/${notification.actor.username}`);
    } else if (notification.type === 'poke' && notification.actor) {
      navigate(`/profile/${notification.actor.username}`);
    } else if (notification.type === 'friend_request') {
      navigate(`/profile`);
    } else if (notification.type === 'message_request') {
      navigate('/messages');
    } else if (notification.type === 'group_post' && notification.group_id) {
      navigate(`/groups/${notification.group_id}`);
    } else if (notification.type === 'invitation' && notification.group_id) {
      navigate(`/groups/${notification.group_id}`);
    } else if (notification.type === 'invitation' && notification.page_id) {
      navigate(`/pages/${notification.page_id}`);
    } else if (notification.type === 'group_membership_accepted' && notification.group_id) {
      navigate(`/groups/${notification.group_id}`);
    } else if (notification.type === 'hashtag_post') {
      navigate(`/hashtag/${notification.hashtag || ''}`);
    } else if (notification.type === 'security_login') {
      navigate('/settings/security');
    } else if (notification.actor) {
      navigate(`/profile/${notification.actor.username}`);
    }
  };

  const getNotificationIcon = (type: string) => {
    const className = "h-5 w-5 text-muted-foreground";
    switch (type) {
      case 'like':
        return <Heart className={className} />;
      case 'comment':
        return <MessageCircle className={className} />;
      case 'mention':
        return <AtSign className={className} />;
      case 'follow':
        return <UserPlus className={className} />;
      case 'tag':
        return <Tag className={className} />;
      case 'share':
        return <RefreshCw className={className} />;
      case 'post_from_followed':
        return <FileText className={className} />;
      case 'group_post':
        return <Users className={className} />;
      case 'poke':
        return <Hand className={className} />;
      case 'hashtag_post':
        return <Hash className={className} />;
      case 'friend_request':
        return <User className={className} />;
      case 'message_request':
        return <Mail className={className} />;
      case 'invitation':
        return <Handshake className={className} />;
      case 'group_membership_accepted':
        return <ShieldCheck className={className} />;
      case 'security_login':
        return <Lock className={className} />;
      default:
        return <Bell className={className} />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative hover:bg-tone-purple/10 hover:text-tone-purple transition-colors">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs bg-tone-purple text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="h-auto p-1 text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`cursor-pointer p-3 ${
                  !notification.is_read ? 'bg-accent/50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3 w-full">
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarImage src={notification.actor?.profile_pic} />
                    <AvatarFallback>
                      {notification.actor?.display_name?.charAt(0)?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">{getNotificationIcon(notification.type)}</span>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-semibold">
                            {notification.actor?.display_name}
                          </span>{' '}
                          {notification.message.replace(notification.actor?.display_name || '', '').trim()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.is_read && (
                        <div className="h-2 w-2 bg-tone-purple rounded-full flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
