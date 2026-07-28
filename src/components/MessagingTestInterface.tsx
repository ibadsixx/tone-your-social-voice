import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useMessagingSystem } from '@/hooks/useMessagingSystem';
import { useMessageRequests } from '@/hooks/useMessageRequests';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Send, CheckCircle, XCircle, AlertCircle, Users } from 'lucide-react';

const MessagingTestInterface = () => {
  const { user } = useAuth();
  const { sendMessage, checkFriendship } = useMessagingSystem(user?.id);
  const { requests, acceptRequest, declineRequest, blockUser } = useMessageRequests(user?.id);
  const { toast } = useToast();
  
  const [receiverId, setReceiverId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleSendMessage = async () => {
    if (!receiverId.trim() || !message.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter both receiver ID and message",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await sendMessage(receiverId.trim(), message.trim());
      setLastResult(result);
      
      if (result.success) {
        setMessage('');
        toast({
          title: "Success!",
          description: result.conversationId 
            ? "Direct message sent successfully" 
            : "Message request sent successfully",
        });
      } else {
        toast({
          title: result.error?.code || "Error",
          description: result.error?.message || "Failed to send message",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <Card className="max-w-2xl mx-auto mt-8">
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
          <p className="text-muted-foreground">
            Please sign in to test the messaging system.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Messaging System Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Receiver User ID</label>
            <Input
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
              placeholder="Enter the UUID of the user you want to message"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Your ID: {user.id}
            </p>
          </div>
          
          <div>
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              className="mt-1"
              rows={3}
            />
          </div>
          
          <Button
            onClick={handleSendMessage}
            disabled={loading || !receiverId.trim() || !message.trim()}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {loading ? 'Sending...' : 'Send Message'}
          </Button>
          
          {lastResult && (
            <Card className={`mt-4 ${lastResult.success ? 'border-green-500' : 'border-red-500'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {lastResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="font-medium">
                    {lastResult.success ? 'Success' : 'Error'}
                  </span>
                </div>
                
                {lastResult.success ? (
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {lastResult.conversationId 
                        ? `Direct message sent! Conversation ID: ${lastResult.conversationId}`
                        : 'Message request sent successfully'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-red-600">
                      {lastResult.error?.code}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {lastResult.error?.message}
                    </p>
                    {lastResult.error?.details && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {lastResult.error.details}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Message Requests */}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Incoming Message Requests ({requests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">
                      {request.sender_profile?.display_name || 'Unknown'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      @{request.sender_profile?.username || 'unknown'}
                    </p>
                    <Badge variant="secondary" className="mt-1">
                      {request.category}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => acceptRequest(request.id, request.sender_id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => declineRequest(request.id)}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => blockUser(request.id, request.sender_id)}
                    >
                      Block
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Testing Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-medium">Test Scenarios:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-2">
              <li>• <strong>Friends messaging:</strong> If you're friends with the receiver, the message will be sent directly</li>
              <li>• <strong>Non-friends messaging:</strong> If you're not friends, a message request will be created</li>
              <li>• <strong>Blocked users:</strong> If either user is blocked, the message will fail with a specific error</li>
              <li>• <strong>Invalid user:</strong> If the user ID doesn't exist, you'll get an error</li>
              <li>• <strong>Self-messaging:</strong> You cannot send messages to yourself</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium">Error Codes:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-2">
              <li>• <strong>AUTH_REQUIRED:</strong> User not logged in</li>
              <li>• <strong>EMPTY_MESSAGE:</strong> Message content is empty</li>
              <li>• <strong>USER_BLOCKED:</strong> Cannot message blocked users</li>
              <li>• <strong>DUPLICATE_REQUEST:</strong> Message request already exists</li>
              <li>• <strong>SEND_FAILED:</strong> Database/RLS error</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MessagingTestInterface;