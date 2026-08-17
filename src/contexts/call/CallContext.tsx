import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { WebRTCService, CallSignal, CallType } from '@/services/webrtc';
import { useToast } from '@/hooks/use-toast';
import { 
  CallState, 
  CallContextType, 
  CallParticipant, 
  CallStatusDb,
  initialCallState 
} from './types';
import { useCallSignaling } from './useCallSignaling';
import { useCallDatabase } from './useCallDatabase';
import { useConnectionQuality } from './useConnectionQuality';
import { callTabCoordinator, CALL_ACTIVE_STORAGE_KEY, CALL_RESOLVED_STORAGE_KEY, markCallResolved } from './callTabCoordinator';
import { CallDelivery } from '@/lib/callRealtime';

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();
  const { logCallToDb } = useCallDatabase();
  
  const [callState, setCallState] = useState<CallState>(initialCallState);

  // Use refs to access current state in callbacks without stale closures
  const callStateRef = useRef<CallState>(callState);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSignalRef = useRef<CallSignal | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Initialize WebRTC service
  useEffect(() => {
    webrtcRef.current = new WebRTCService();
    return () => {
      webrtcRef.current?.cleanup();
    };
  }, []);

  // Connection quality monitoring
  const connectionQuality = useConnectionQuality({
    webrtcService: webrtcRef.current,
    isConnected: callState.status === 'connected',
  });

  // Update connection quality in state
  useEffect(() => {
    if (callState.status === 'connected') {
      setCallState(prev => ({ ...prev, connectionQuality }));
    }
  }, [connectionQuality, callState.status]);

  // Clear call timeout helper
  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
  }, []);

  // Reset call state
  const resetCallState = useCallback(() => {
    console.log('[Call] Resetting call state');
    clearCallTimeout();

    callTabCoordinator.exitCall();

    webrtcRef.current?.cleanup();
    webrtcRef.current = new WebRTCService();
    
    pendingSignalRef.current = null;
    iceCandidateQueueRef.current = [];
    
    setCallState(initialCallState);
  }, [clearCallTimeout]);

  // Process queued ICE candidates
  const processIceCandidateQueue = useCallback(async () => {
    if (!webrtcRef.current || iceCandidateQueueRef.current.length === 0) return;
    
    console.log('[Call] Processing', iceCandidateQueueRef.current.length, 'queued ICE candidates');
    
    for (const candidate of iceCandidateQueueRef.current) {
      try {
        await webrtcRef.current.addIceCandidate(candidate);
      } catch (error) {
        console.error('[Call] Error adding queued ICE candidate:', error);
      }
    }
    iceCandidateQueueRef.current = [];
  }, []);

  // Setup WebRTC callbacks helper
  const setupWebRTCCallbacks = useCallback((targetUserId: string, callType: CallType, sendSignal: (signal: CallSignal) => Promise<CallDelivery>) => {
    if (!webrtcRef.current || !user?.id) return;

    webrtcRef.current.setOnRemoteStream((stream) => {
      console.log('[Call] Remote stream received');
      setCallState(prev => ({ ...prev, remoteStream: stream, status: 'connected' }));
    });

    webrtcRef.current.setOnIceCandidate((candidate) => {
      sendSignal({
        type: 'ice-candidate',
        from: user.id,
        to: targetUserId,
        callType,
        payload: candidate,
      });
    });

    webrtcRef.current.setOnConnectionStateChange((state) => {
      console.log('[Call] Connection state changed:', state);
      if (state === 'connected') {
        // Clear connecting timeout on successful connection
        if (connectingTimeoutRef.current) {
          clearTimeout(connectingTimeoutRef.current);
          connectingTimeoutRef.current = null;
        }
        setCallState(prev => ({ ...prev, status: 'connected' }));
      } else if (state === 'failed' || state === 'disconnected') {
        // Try ICE restart for recoverable failures
        if (state === 'disconnected' && webrtcRef.current) {
          console.log('[Call] Attempting ICE restart...');
          webrtcRef.current.restartIce().catch(() => {
            toast({
              title: 'Connection Lost',
              description: 'The call connection was interrupted.',
              variant: 'destructive',
            });
            resetCallState();
          });
        } else {
          toast({
            title: 'Connection Lost',
            description: 'The call connection was interrupted.',
            variant: 'destructive',
          });
          resetCallState();
        }
      }
    });
  }, [user?.id, toast, resetCallState]);

  // Handle incoming signals
  const handleSignal = useCallback(async (signal: CallSignal, sendSignal: (signal: CallSignal) => Promise<CallDelivery>) => {
    if (!user?.id || signal.to !== user.id) return;

    const currentState = callStateRef.current;
    console.log('[Call] Received signal:', signal.type, 'current status:', currentState.status);

    switch (signal.type) {
      case 'call-request':
        if (currentState.status !== 'idle' || callTabCoordinator.isActive()) {
          console.log('[Call] Already in call, sending busy');
          sendSignal({
            type: 'call-busy',
            from: user.id,
            to: signal.from,
            callType: signal.callType,
          });
          return;
        }

        pendingSignalRef.current = signal;
        setCallState(prev => ({
          ...prev,
          status: 'ringing',
          callType: signal.callType,
          isOutgoing: false,
          remoteUser: signal.callerInfo || null,
        }));
        break;

      case 'call-accepted':
        if (webrtcRef.current && currentState.status === 'calling') {
          console.log('[Call] Call accepted, creating offer');
          clearCallTimeout();
          setCallState(prev => ({ ...prev, status: 'connecting' }));
          
          // Set connecting timeout (20 seconds to establish connection)
          connectingTimeoutRef.current = setTimeout(() => {
            if (callStateRef.current.status === 'connecting') {
              console.log('[Call] Connection timeout');
              toast({
                title: 'Connection Failed',
                description: 'Could not establish a stable connection. Please try again.',
                variant: 'destructive',
              });
              
              if (callStateRef.current.remoteUser) {
                sendSignal({
                  type: 'call-ended',
                  from: user.id,
                  to: callStateRef.current.remoteUser.id,
                  callType: callStateRef.current.callType || 'voice',
                });
                logCallToDb(
                  user.id,
                  callStateRef.current.remoteUser.id,
                  callStateRef.current.callType || 'voice',
                  'failed',
                  0,
                );
              }
              
              resetCallState();
            }
          }, 20000);
          
          setupWebRTCCallbacks(signal.from, currentState.callType!, sendSignal);

          try {
            const offer = await webrtcRef.current.createOffer();
            await sendSignal({
              type: 'offer',
              from: user.id,
              to: signal.from,
              callType: currentState.callType!,
              payload: offer,
            });
          } catch (error) {
            console.error('[Call] Error creating offer:', error);
            toast({
              title: 'Call Failed',
              description: 'Could not establish connection.',
              variant: 'destructive',
            });
            resetCallState();
          }
        }
        break;

      case 'offer':
        if (webrtcRef.current && (currentState.status === 'connecting' || currentState.status === 'ringing')) {
          console.log('[Call] Received offer, creating answer');
          try {
            await webrtcRef.current.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            await processIceCandidateQueue();
            const answer = await webrtcRef.current.createAnswer();
            
            await sendSignal({
              type: 'answer',
              from: user.id,
              to: signal.from,
              callType: signal.callType,
              payload: answer,
            });
          } catch (error) {
            console.error('[Call] Error handling offer:', error);
            toast({
              title: 'Call Failed',
              description: 'Could not establish connection.',
              variant: 'destructive',
            });
            resetCallState();
          }
        }
        break;

      case 'answer':
        if (webrtcRef.current && currentState.status === 'connecting') {
          console.log('[Call] Received answer');
          try {
            await webrtcRef.current.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            await processIceCandidateQueue();
          } catch (error) {
            console.error('[Call] Error setting remote description:', error);
          }
        }
        break;

      case 'ice-candidate':
        if (webrtcRef.current && signal.payload) {
          if (webrtcRef.current.hasRemoteDescription()) {
            try {
              await webrtcRef.current.addIceCandidate(signal.payload as RTCIceCandidateInit);
            } catch (error) {
              console.error('[Call] Error adding ICE candidate:', error);
            }
          } else {
            console.log('[Call] Queueing ICE candidate (no remote description yet)');
            iceCandidateQueueRef.current.push(signal.payload as RTCIceCandidateInit);
          }
        }
        break;

      case 'call-rejected':
        clearCallTimeout();
        if (currentState.isOutgoing && currentState.remoteUser) {
          logCallToDb(user.id, currentState.remoteUser.id, signal.callType, 'declined', 0);
        }
        toast({
          title: 'Call Declined',
          description: 'The user declined your call.',
          variant: 'destructive',
        });
        resetCallState();
        break;

      case 'call-busy':
        clearCallTimeout();
        if (currentState.isOutgoing && currentState.remoteUser) {
          logCallToDb(user.id, currentState.remoteUser.id, signal.callType, 'busy', 0);
        }
        toast({
          title: 'User Busy',
          description: 'The user is currently in another call.',
          variant: 'destructive',
        });
        resetCallState();
        break;

      case 'call-ended':
        clearCallTimeout();
        // Log call history for the caller when the remote side ends the call.
        // The caller owns the record (RLS only allows inserts as caller_id), so
        // exactly one row is written per call regardless of who ended it.
        if (currentState.isOutgoing && currentState.remoteUser) {
          const wasConnected = currentState.status === 'connected';
          const dbStatus: CallStatusDb = wasConnected ? 'completed' : 'missed';
          logCallToDb(user.id, currentState.remoteUser.id, signal.callType, dbStatus, currentState.callDuration);
        }
        toast({
          title: 'Call Ended',
          description: 'The call has ended.',
        });
        resetCallState();
        break;
    }
  }, [user?.id, toast, resetCallState, clearCallTimeout, processIceCandidateQueue, setupWebRTCCallbacks, logCallToDb]);

  // Signaling hook with wrapped handler
  const { sendSignal } = useCallSignaling({
    userId: user?.id,
    onSignal: (signal) => handleSignal(signal, sendSignal),
  });

  // Call duration timer
  useEffect(() => {
    if (callState.status === 'connected') {
      durationIntervalRef.current = setInterval(() => {
        setCallState(prev => ({ ...prev, callDuration: prev.callDuration + 1 }));
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [callState.status]);

  // If another tab accepts or rejects the incoming call, stop ringing here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (callStateRef.current.status !== 'ringing') return;
      if (e.key === CALL_ACTIVE_STORAGE_KEY) {
        const count = parseInt(e.newValue || '0', 10) || 0;
        if (count > 0) {
          console.log('[Call] Call accepted in another tab, cancelling ring');
          resetCallState();
        }
      } else if (e.key === CALL_RESOLVED_STORAGE_KEY) {
        console.log('[Call] Call resolved in another tab, cancelling ring');
        resetCallState();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [resetCallState]);

  // Initiate a call
  const initiateCall = useCallback(async (userId: string, userInfo: CallParticipant, callType: CallType) => {
    if (!user?.id || !profile || !webrtcRef.current) {
      console.error('[Call] Cannot initiate call: missing user, profile, or WebRTC', { user: user?.id, profile: !!profile, webrtc: !!webrtcRef.current });
      toast({
        title: 'Call Failed',
        description: !profile
          ? 'Your profile could not be loaded. Please refresh and try again.'
          : 'Calling is not available right now.',
        variant: 'destructive',
      });
      return;
    }

    console.log('[Call] Initiating', callType, 'call to', userId);

    try {
      const localStream = await webrtcRef.current.getLocalStream(callType);
      setupWebRTCCallbacks(userId, callType, sendSignal);
      
      setCallState(prev => ({
        ...prev,
        status: 'calling',
        callType,
        isOutgoing: true,
        remoteUser: userInfo,
        localStream,
        isVideoOff: callType === 'voice',
      }));

      callTabCoordinator.enterCall();

      const delivery = await sendSignal({
        type: 'call-request',
        from: user.id,
        to: userId,
        callType,
        callerInfo: {
          id: user.id,
          username: profile.username || '',
          displayName: profile.display_name || '',
          profilePic: profile.profile_pic,
        },
      });
      if (!delivery.ok) {
        console.warn('[Call] call-request publish failed');
      } else if (delivery.delivered === 0) {
        // delivered counts only subscribers on the gateway instance that served
        // this publish. With the gateway's cross-instance Realtime bus, the
        // callee may still receive the call on another instance, so this is no
        // longer a reliable offline signal; the No Answer timeout handles it.
        console.warn('[Call] call-request delivered to 0 local subscribers (callee may be on another gateway instance)');
      }

      callTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current.status === 'calling') {
          console.log('[Call] No answer timeout');
          toast({
            title: 'No Answer',
            description: 'The user did not answer your call.',
            variant: 'destructive',
          });
          
          sendSignal({
            type: 'call-ended',
            from: user.id,
            to: userId,
            callType,
          });
          
          logCallToDb(user.id, userId, callType, 'missed', 0);
          resetCallState();
        }
      }, 30000);
    } catch (error) {
      console.error('[Call] Error initiating call:', error);
      toast({
        title: 'Call Failed',
        description: 'Could not access camera/microphone. Please check permissions.',
        variant: 'destructive',
      });
      resetCallState();
    }
  }, [user?.id, profile, sendSignal, toast, resetCallState, setupWebRTCCallbacks, logCallToDb]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    if (!user?.id || !pendingSignalRef.current) return;

    const signal = pendingSignalRef.current;
    console.log('[Call] Rejecting call from', signal.from);
    
    sendSignal({
      type: 'call-rejected',
      from: user.id,
      to: signal.from,
      callType: signal.callType,
    });

    markCallResolved();
    resetCallState();
  }, [user?.id, sendSignal, resetCallState]);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!user?.id || !webrtcRef.current || !pendingSignalRef.current) {
      console.error('[Call] Cannot accept call: missing requirements');
      return;
    }

    const signal = pendingSignalRef.current;
    console.log('[Call] Accepting call from', signal.from);

    // Guard against double-accept across tabs of the same user.
    if (callTabCoordinator.isActive()) {
      console.log('[Call] Already in a call in another tab, ignoring accept');
      toast({
        title: 'Call Handled Elsewhere',
        description: 'You already have an active call in another tab.',
      });
      resetCallState();
      return;
    }

    try {
      const localStream = await webrtcRef.current.getLocalStream(signal.callType);
      setupWebRTCCallbacks(signal.from, signal.callType, sendSignal);

      setCallState(prev => ({
        ...prev,
        status: 'connecting',
        localStream,
        isVideoOff: signal.callType === 'voice',
      }));

      callTabCoordinator.enterCall();

      await sendSignal({
        type: 'call-accepted',
        from: user.id,
        to: signal.from,
        callType: signal.callType,
      });
    } catch (error) {
      console.error('[Call] Error accepting call:', error);
      toast({
        title: 'Call Failed',
        description: 'Could not access camera/microphone.',
        variant: 'destructive',
      });
      rejectCall();
    }
  }, [user?.id, sendSignal, toast, setupWebRTCCallbacks, resetCallState, rejectCall]);

  // End call
  const endCall = useCallback(() => {
    if (!user?.id) return;

    const remoteUser = callStateRef.current.remoteUser;
    const callType = callStateRef.current.callType;
    const duration = callStateRef.current.callDuration;
    const wasConnected = callStateRef.current.status === 'connected';
    const isOutgoing = callStateRef.current.isOutgoing;

    console.log('[Call] Ending call');

    if (remoteUser) {
      sendSignal({
        type: 'call-ended',
        from: user.id,
        to: remoteUser.id,
        callType: callType || 'voice',
      });

      if (isOutgoing) {
        const dbStatus: CallStatusDb = wasConnected ? 'completed' : 'missed';
        logCallToDb(user.id, remoteUser.id, callType || 'voice', dbStatus, duration);
      }
    }

    resetCallState();
  }, [user?.id, sendSignal, resetCallState, logCallToDb]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const newMuted = !callStateRef.current.isMuted;
    console.log('[Call] Toggle mute:', newMuted);
    webrtcRef.current?.toggleMute(newMuted);
    setCallState(prev => ({ ...prev, isMuted: newMuted }));
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    const newVideoOff = !callStateRef.current.isVideoOff;
    console.log('[Call] Toggle video:', newVideoOff);
    webrtcRef.current?.toggleVideo(newVideoOff);
    setCallState(prev => ({ ...prev, isVideoOff: newVideoOff }));
  }, []);

  // Toggle minimize
  const toggleMinimize = useCallback(() => {
    setCallState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  }, []);

  return (
    <CallContext.Provider
      value={{
        ...callState,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleMinimize,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
