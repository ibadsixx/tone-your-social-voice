import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';
import { usePeopleYouMayKnow } from '@/hooks/usePeopleYouMayKnow';
import { usePendingFriendRequests } from '@/hooks/usePendingFriendRequests';
import { useFriendRequestLiveUpdates } from '@/hooks/useFriendRequestLiveUpdates';
import { ArrowLeft, UserCheck, UserPlus, X, Loader2, User, Users } from 'lucide-react';

interface SentRequest {
  id: string;
  receiver_id: string;
  receiver: {
    display_name: string;
    username: string;
    profile_pic: string | null;
  } | null;
  created_at: string;
}

const FriendRequestsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Pending INCOMING requests come from the one global provider (do.md), shared
  // with the desktop dropdown and the mobile header icon. This page used to keep a
  // second copy of the same query, which is why accepting a request in the
  // dropdown left it listed here until this page's own next fetch.
  const { requests, loading, actionLoading, refresh, accept, reject } = usePendingFriendRequests();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const { suggestions, loading: loadingSuggestions, sendFriendRequest, removeSuggestion } = usePeopleYouMayKnow(5);

  const fetchSentRequests = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoadingSent(true);
    try {
      const { data, error } = await gateway
        .from('friends')
        .select(`
          id,
          receiver_id,
          created_at,
          receiver:profiles!friends_receiver_id_fkey(
            display_name,
            username,
            profile_pic
          )
        `)
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSentRequests(data || []);
    } catch (error: any) {
      console.error('Error fetching sent requests:', error);
    } finally {
      setLoadingSent(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // The received list is the provider's job now (it fetched on mount and keeps
    // itself live); only the SENT tab is still fetched here.
    fetchSentRequests();
  }, [fetchSentRequests]);

  // The SENT tab still needs its own live refresh, which the shared
  // `useFriendRequestLiveUpdates` provided before. It is mounted here rather than
  // in the provider because sent requests are not counted by any badge and are
  // only ever read on this page. The received list deliberately does NOT get a
  // second live-update hook here - the provider already owns that one, and running
  // it twice is exactly the duplicate subscription do.md rules out.
  useFriendRequestLiveUpdates(() => {
    fetchSentRequests(true);
  }, user?.id);

  const handleAccept = async (requestId: string) => {
    await accept(requestId);
  };

  const handleReject = async (requestId: string) => {
    await reject(requestId);
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
        <h1 className="font-semibold text-base">Friend Requests</h1>
      </header>

      <div className="flex border-b">
        <button
          className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${tab === 'received' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setTab('received')}
        >
          Received{requests.length > 0 && ` (${requests.length})`}
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${tab === 'sent' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setTab('sent')}
        >
          Sent{sentRequests.length > 0 && ` (${sentRequests.length})`}
        </button>
      </div>

      <main className="flex-1">
        {tab === 'received' ? (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <User className="h-12 w-12 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No pending friend requests</p>
              </div>
            ) : (
              <ul className="divide-y">
                {requests.map((request) => (
                  <li key={request.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarImage src={request.requester?.profile_pic || undefined} className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {request.requester?.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {request.requester?.display_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        @{request.requester?.username || 'unknown'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-9 px-3"
                        onClick={() => handleAccept(request.id)}
                        disabled={actionLoading === request.id}
                      >
                        {actionLoading === request.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3"
                        onClick={() => handleReject(request.id)}
                        disabled={actionLoading === request.id}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                ))}
                {requests.length > 10 && (
                  <li className="py-3 text-center text-sm text-muted-foreground">
                    + {requests.length - 10} more
                  </li>
                )}
              </ul>
            )}

            {suggestions.length > 0 && (
              <div className="border-t px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">People you may know</span>
                </div>
                {suggestions.map((person) => (
                  <div key={person.id} className="flex items-center gap-3 py-2">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={person.profile_pic || undefined} className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {person.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">{person.display_name}</p>
                      {person.mutual_friends_count > 0 && (
                        <p className="text-xs text-muted-foreground truncate leading-tight">
                          {person.mutual_friends_count} mutual friend{person.mutual_friends_count > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => sendFriendRequest(person.id)}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {loadingSent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sentRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <User className="h-12 w-12 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No sent friend requests</p>
              </div>
            ) : (
              <ul className="divide-y">
                {sentRequests.map((request) => (
                  <li key={request.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarImage src={request.receiver?.profile_pic || undefined} className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {request.receiver?.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {request.receiver?.display_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        @{request.receiver?.username || 'unknown'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default FriendRequestsPage;
