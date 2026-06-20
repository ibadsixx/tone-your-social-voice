import { Bell, Check, Loader2, Heart, MessageCircle, AtSign, UserPlus, Tag, RefreshCw, FileText, Users, Hand, Hash, Mail, Handshake, ShieldCheck, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const getNotificationIcon = (type: string) => {
  const className = "h-5 w-5 text-muted-foreground shrink-0";
  switch (type) {
    case 'like': return <Heart className={className} />;
    case 'comment': return <MessageCircle className={className} />;
    case 'mention': return <AtSign className={className} />;
    case 'follow': return <UserPlus className={className} />;
    case 'tag': return <Tag className={className} />;
    case 'share': return <RefreshCw className={className} />;
    case 'post_from_followed': return <FileText className={className} />;
    case 'group_post': return <Users className={className} />;
    case 'poke': return <Hand className={className} />;
    case 'hashtag_post': return <Hash className={className} />;
    case 'friend_request': return <User className={className} />;
    case 'message_request': return <Mail className={className} />;
    case 'invitation': return <Handshake className={className} />;
    case 'group_membership_accepted': return <ShieldCheck className={className} />;
    case 'security_login': return <Lock className={className} />;
    default: return <Bell className={className} />;
  }
};

const NotificationsPage = () => {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: any) => {
    markAsRead(notification.id);

    if (notification.post_id) {
      navigate(`/post/${notification.post_id}`);
    } else if ((notification.type === 'follow' || notification.type === 'poke') && notification.actor) {
      navigate(`/profile/${notification.actor.username}`);
    } else if (notification.type === 'friend_request') {
      navigate('/profile');
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background border-b px-4 h-12 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 rounded-full hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold text-base flex-1">Notifications</h1>
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
      </header>

      <main className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Bell className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <ul className="divide-y">
            {notifications.map((notification: any) => (
              <li
                key={notification.id}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${
                  !notification.is_read ? 'bg-accent/50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={notification.actor?.profile_pic} />
                  <AvatarFallback>
                    {notification.actor?.display_name?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 min-w-0">
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
                      <div className="h-2 w-2 bg-tone-purple rounded-full shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default NotificationsPage;
