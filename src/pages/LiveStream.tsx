import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Mic, Video, MicOff, VideoOff, Users, Globe, Lock, StopCircle } from 'lucide-react';
import { useLiveStream } from '@/contexts/LiveStreamContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { gateway } from '@/lib/gateway';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

const LiveStream = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    stream,
    participants,
    isHost,
    isConnected,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    viewerCount,
    error,
    endStream,
    toggleRecording,
    toggleMute,
    toggleVideo,
    leaveStream,
    initMedia,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
  } = useLiveStream();

  const [signalingConnected, setSignalingConnected] = useState(false);
  const [isNegotiating, setIsNegotiating] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Track whether media initialization has been attempted
  const hasInitMedia = useRef(false);

  // Initialize media and WebRTC when joining a stream
  useEffect(() => {
    if (!id || !stream || !isConnected) return;

    const initStream = async () => {
      try {
        if (isHost) {
          // Host: initialize local media and create offer
          if (!hasInitMedia.current) {
            try {
              await initMedia(stream.stream_type);
            } catch (mediaErr) {
              console.warn('[LiveStream] Host media init failed:', mediaErr);
            }
            hasInitMedia.current = true;
          }

          if (localStream) {
            const offerSdp = await createOffer();
            setIsNegotiating(true);

            // Publish offer via signaling
            await publishSignalingOffer(offerSdp);
          }
        } else {
          // Viewer: initialize media (audio only for viewers)
          if (!hasInitMedia.current) {
            try {
              await initMedia('audio');
            } catch (mediaErr) {
              console.warn('[LiveStream] Viewer media init failed:', mediaErr);
            }
            hasInitMedia.current = true;
          }
        }
      } catch (err) {
        // Only catch unexpected errors, not media init failures
        console.error('[LiveStream] Stream initialization failed:', err);
        toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
      }
    };

    initStream();

    // Connect to the Gateway's live signaling SSE endpoint
    if (myUserId) {
      const token = localStorage.getItem('tone-auth-token');
      const accessToken = token ? JSON.parse(token).access_token : null;
      const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

      const signalingUrl = accessToken
        ? `${url}?access_token=${encodeURIComponent(accessToken)}`
        : url;
      const es = new EventSource(signalingUrl, {
        withCredentials: true,
      });

      esRef.current = es;

      es.onopen = () => {
        setSignalingConnected(true);
        console.log('[LiveStream] Signaling connected');
      };

      es.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            // SSE connection initialized
            return;
          }

          if (data.type === 'participant-joined') {
            // New participant joined
            if (data.fromUserId !== myUserId) {
              hasViewerRef.current = true;
              // If we're the host, create an offer for the new participant
              if (isHost && localStream && !hasCreatedOfferRef.current) {
                hasCreatedOfferRef.current = true;
                console.log('[LiveStream] Creating offer for new participant');
                const offerSdp = await createOffer();
                setIsNegotiating(true);

                // Publish offer via signaling
                await publishSignalingOffer(offerSdp, data.fromUserId);
              }
            }
            return;
          }

          if (data.type === 'session-ended') {
            leaveStream();
            navigate('/');
            return;
          }

          // Handle WebRTC signaling messages directed at us
          if (data.toUserId && data.toUserId !== myUserId) return;

          if (data.type === 'offer' && data.sdp) {
            // Remote peer sent us an offer - create and send answer
            const answerSdp = await handleOffer(data.sdp, data.fromUserId);
            await publishSignalingAnswer(answerSdp, data.fromUserId);
            return;
          }

          if (data.type === 'answer' && data.sdp) {
            // Remote peer sent us an answer
            await handleAnswer(data.sdp);
            setIsNegotiating(false);
            return;
          }

          if (data.type === 'ice-candidate' && data.candidate) {
            await addIceCandidate(data.candidate);
            return;
          }

          if (data.type === 'participant-left') {
            // Participant left
            return;
          }
        } catch (err) {
          // Only catch unexpected errors, not media init failures
          console.error('[LiveStream] Stream initialization failed:', err);
          toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
        }
      };

    initStream();

    // Connect to the Gateway's live signaling SSE endpoint
    if (myUserId) {
      const token = localStorage.getItem('tone-auth-token');
      const accessToken = token ? JSON.parse(token).access_token : null;
      const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

      const signalingUrl = accessToken
        ? `${url}?access_token=${encodeURIComponent(accessToken)}`
        : url;
      const es = new EventSource(signalingUrl, {
        withCredentials: true,
      });

      esRef.current = es;

      es.onopen = () => {
        setSignalingConnected(true);
        console.log('[LiveStream] Signaling connected');
      };

      es.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            // SSE connection initialized
            return;
          }

          if (data.type === 'participant-joined') {
            // New participant joined
            if (data.fromUserId !== myUserId) {
              hasViewerRef.current = true;
              // If we're the host, create an offer for the new participant
              if (isHost && localStream && !hasCreatedOfferRef.current) {
                hasCreatedOfferRef.current = true;
                console.log('[LiveStream] Creating offer for new participant');
                const offerSdp = await createOffer();
                setIsNegotiating(true);

                // Publish offer via signaling
                await publishSignalingOffer(offerSdp, data.fromUserId);
              }
            }
            return;
          }

          if (data.type === 'session-ended') {
            leaveStream();
            navigate('/');
            return;
          }

          // Handle WebRTC signaling messages directed at us
          if (data.toUserId && data.toUserId !== myUserId) return;

          if (data.type === 'offer' && data.sdp) {
            // Remote peer sent us an offer - create and send answer
            const answerSdp = await handleOffer(data.sdp, data.fromUserId);
            await publishSignalingAnswer(answerSdp, data.fromUserId);
            return;
          }

          if (data.type === 'answer' && data.sdp) {
            // Remote peer sent us an answer
            await handleAnswer(data.sdp);
            setIsNegotiating(false);
            return;
          }

          if (data.type === 'ice-candidate' && data.candidate) {
            await addIceCandidate(data.candidate);
            return;
          }

          if (data.type === 'participant-left') {
            // Participant left
            return;
          }
        } catch (err) {
          // Only catch unexpected errors, not media init failures
          console.error('[LiveStream] Stream initialization failed:', err);
          toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
        }
      };

      initStream();

      // Connect to the Gateway's live signaling SSE endpoint
      if (myUserId) {
        const token = localStorage.getItem('tone-auth-token');
        const accessToken = token ? JSON.parse(token).access_token : null;
        const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

        const signalingUrl = accessToken
          ? `${url}?access_token=${encodeURIComponent(accessToken)}`
          : url;
        const es = new EventSource(signalingUrl, {
          withCredentials: true,
        });

        esRef.current = es;

        es.onopen = () => {
          setSignalingConnected(true);
          console.log('[LiveStream] Signaling connected');
        };

        es.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'init') {
              // SSE connection initialized
              return;
            }

            if (data.type === 'participant-joined') {
              // New participant joined
              if (data.fromUserId !== myUserId) {
                hasViewerRef.current = true;
                // If we're the host, create an offer for the new participant
                if (isHost && localStream && !hasCreatedOfferRef.current) {
                  hasCreatedOfferRef.current = true;
                  console.log('[LiveStream] Creating offer for new participant');
                  const offerSdp = await createOffer();
                  setIsNegotiating(true);

                  // Publish offer via signaling
                  await publishSignalingOffer(offerSdp, data.fromUserId);
                }
              }
              return;
            }

            if (data.type === 'session-ended') {
              leaveStream();
              navigate('/');
              return;
            }

            // Handle WebRTC signaling messages directed at us
            if (data.toUserId && data.toUserId !== myUserId) return;

            if (data.type === 'offer' && data.sdp) {
              // Remote peer sent us an offer - create and send answer
              const answerSdp = await handleOffer(data.sdp, data.fromUserId);
              await publishSignalingAnswer(answerSdp, data.fromUserId);
              return;
            }

            if (data.type === 'answer' && data.sdp) {
              // Remote peer sent us an answer
              await handleAnswer(data.sdp);
              setIsNegotiating(false);
              return;
            }

            if (data.type === 'ice-candidate' && data.candidate) {
              await addIceCandidate(data.candidate);
              return;
            }

            if (data.type === 'participant-left') {
              // Participant left
              return;
            }
          } catch (err) {
            // Only catch unexpected errors, not media init failures
            console.error('[LiveStream] Stream initialization failed:', err);
            toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
          }
        };

        initStream();

        // Connect to the Gateway's live signaling SSE endpoint
        if (myUserId) {
          const token = localStorage.getItem('tone-auth-token');
          const accessToken = token ? JSON.parse(token).access_token : null;
          const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

          const signalingUrl = accessToken
            ? `${url}?access_token=${encodeURIComponent(accessToken)}`
            : url;
          const es = new EventSource(signalingUrl, {
            withCredentials: true,
          });

          esRef.current = es;

          es.onopen = () => {
            setSignalingConnected(true);
            console.log('[LiveStream] Signaling connected');
          };

          es.onmessage = async (event) => {
            try {
              const data = JSON.parse(event.data);

              if (data.type === 'init') {
                // SSE connection initialized
                return;
              }

              if (data.type === 'participant-joined') {
                // New participant joined
                if (data.fromUserId !== myUserId) {
                  hasViewerRef.current = true;
                  // If we're the host, create an offer for the new participant
                  if (isHost && localStream && !hasCreatedOfferRef.current) {
                    hasCreatedOfferRef.current = true;
                    console.log('[LiveStream] Creating offer for new participant');
                    const offerSdp = await createOffer();
                    setIsNegotiating(true);

                    // Publish offer via signaling
                    await publishSignalingOffer(offerSdp, data.fromUserId);
                  }
                }
                return;
              }

              if (data.type === 'session-ended') {
                leaveStream();
                navigate('/');
                return;
              }

              // Handle WebRTC signaling messages directed at us
              if (data.toUserId && data.toUserId !== myUserId) return;

              if (data.type === 'offer' && data.sdp) {
                // Remote peer sent us an offer - create and send answer
                const answerSdp = await handleOffer(data.sdp, data.fromUserId);
                await publishSignalingAnswer(answerSdp, data.fromUserId);
                return;
              }

              if (data.type === 'answer' && data.sdp) {
                // Remote peer sent us an answer
                await handleAnswer(data.sdp);
                setIsNegotiating(false);
                return;
              }

              if (data.type === 'ice-candidate' && data.candidate) {
                await addIceCandidate(data.candidate);
                return;
              }

              if (data.type === 'participant-left') {
                // Participant left
                return;
              }
            } catch (err) {
              // Only catch unexpected errors, not media init failures
              console.error('[LiveStream] Stream initialization failed:', err);
              toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
            }
          };

          initStream();

          // Connect to the Gateway's live signaling SSE endpoint
          if (myUserId) {
            const token = localStorage.getItem('tone-auth-token');
            const accessToken = token ? JSON.parse(token).access_token : null;
            const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

            const signalingUrl = accessToken
              ? `${url}?access_token=${encodeURIComponent(accessToken)}`
              : url;
            const es = new EventSource(signalingUrl, {
              withCredentials: true,
            });

            esRef.current = es;

            es.onopen = () => {
              setSignalingConnected(true);
              console.log('[LiveStream] Signaling connected');
            };

            es.onmessage = async (event) => {
              try {
                const data = JSON.parse(event.data);

                if (data.type === 'init') {
                  // SSE connection initialized
                  return;
                }

                if (data.type === 'participant-joined') {
                  // New participant joined
                  if (data.fromUserId !== myUserId) {
                    hasViewerRef.current = true;
                    // If we're the host, create an offer for the new participant
                    if (isHost && localStream && !hasCreatedOfferRef.current) {
                      hasCreatedOfferRef.current = true;
                      console.log('[LiveStream] Creating offer for new participant');
                      const offerSdp = await createOffer();
                      setIsNegotiating(true);

                      // Publish offer via signaling
                      await publishSignalingOffer(offerSdp, data.fromUserId);
                    }
                  }
                  return;
                }

                if (data.type === 'session-ended') {
                  leaveStream();
                  navigate('/');
                  return;
                }

                // Handle WebRTC signaling messages directed at us
                if (data.toUserId && data.toUserId !== myUserId) return;

                if (data.type === 'offer' && data.sdp) {
                  // Remote peer sent us an offer - create and send answer
                  const answerSdp = await handleOffer(data.sdp, data.fromUserId);
                  await publishSignalingAnswer(answerSdp, data.fromUserId);
                  return;
                }

                if (data.type === 'answer' && data.sdp) {
                  // Remote peer sent us an answer
                  await handleAnswer(data.sdp);
                  setIsNegotiating(false);
                  return;
                }

                if (data.type === 'ice-candidate' && data.candidate) {
                  await addIceCandidate(data.candidate);
                  return;
                }

                if (data.type === 'participant-left') {
                  // Participant left
                  return;
                }
              } catch (err) {
                // Only catch unexpected errors, not media init failures
                console.error('[LiveStream] Stream initialization failed:', err);
                toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
              }
            };

            initStream();

            // Connect to the Gateway's live signaling SSE endpoint
            if (myUserId) {
              const token = localStorage.getItem('tone-auth-token');
              const accessToken = token ? JSON.parse(token).access_token : null;
              const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

              const signalingUrl = accessToken
                ? `${url}?access_token=${encodeURIComponent(accessToken)}`
                : url;
              const es = new EventSource(signalingUrl, {
                withCredentials: true,
              });

              esRef.current = es;

              es.onopen = () => {
                setSignalingConnected(true);
                console.log('[LiveStream] Signaling connected');
              };

              es.onmessage = async (event) => {
                try {
                  const data = JSON.parse(event.data);

                  if (data.type === 'init') {
                    // SSE connection initialized
                    return;
                  }

                  if (data.type === 'participant-joined') {
                    // New participant joined
                    if (data.fromUserId !== myUserId) {
                      hasViewerRef.current = true;
                      // If we're the host, create an offer for the new participant
                      if (isHost && localStream && !hasCreatedOfferRef.current) {
                        hasCreatedOfferRef.current = true;
                        console.log('[LiveStream] Creating offer for new participant');
                        const offerSdp = await createOffer();
                        setIsNegotiating(true);

                        // Publish offer via signaling
                        await publishSignalingEvent(offerSdp, data.fromUserId);
                      }
                    }
                    return;
                  }

                  if (data.type === 'session-ended') {
                    leaveStream();
                    navigate('/');
                    return;
                  }

                  // Handle WebRTC signaling messages directed at us
                  if (data.toUserId && data.toUserId !== myUserId) return;

                  if (data.type === 'offer' && data.sdp) {
                    // Remote peer sent us an offer - create and send answer
                    const answerSdp = await handleOffer(data.sdp, data.fromUserId);
                    await publishSignalingAnswer(answerSdp, data.fromUserId);
                    return;
                  }

                  if (data.type === 'answer' && data.sdp) {
                    // Remote peer sent us an answer
                    await handleAnswer(data.sdp);
                    setIsNegotiating(false);
                    return;
                  }

                  if (data.type === 'ice-candidate' && data.candidate) {
                    await addIceCandidate(data.candidate);
                    return;
                  }

                  if (data.type === 'participant-left') {
                    // Participant left
                    return;
                  }
                } catch (err) {
                  // Only catch unexpected errors, not media init failures
                  console.error('[LiveStream] Stream initialization failed:', err);
                  toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
                }
              };

              initStream();

              // Connect to the Gateway's live signaling SSE endpoint
              if (myUserId) {
                const token = localStorage.getItem('tone-auth-token');
                const accessToken = token ? JSON.parse(token).access_token : null;
                const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

                const signalingUrl = accessToken
                  ? `${url}?access_token=${encodeURIComponent(accessToken)}`
                  : url;
                const es = new EventSource(signalingUrl, {
                  withCredentials: true,
                });

                esRef.current = es;

                es.onopen = () => {
                  setSignalingConnected(true);
                  console.log('[LiveStream] Signaling connected');
                };

                es.onmessage = async (event) => {
                  try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'init') {
                      // SSE connection initialized
                      return;
                    }

                    if (data.type === 'participant-joined') {
                      // New participant joined
                      if (data.fromUserId !== myUserId) {
                        hasViewerRef.current = true;
                        // If we're the host, create an offer for the new participant
                        if (isHost && localStream && !hasCreatedOfferRef.current) {
                          hasCreatedOfferRef.current = true;
                          console.log('[LiveStream] Creating offer for new participant');
                          const offerSdp = await createOffer();
                          setIsNegotiating(true);

                          // Publish offer via signaling
                          await publishSignalingOffer(offerSdp, data.fromUserId);
                        }
                      }
                      return;
                    }

                    if (data.type === 'session-ended') {
                      leaveStream();
                      navigate('/');
                      return;
                    }

                    // Handle WebRTC signaling messages directed at us
                    if (data.toUserId && data.toUserId !== myUserId) return;

                    if (data.type === 'offer' && data.sdp) {
                      // Remote peer sent us an offer - create and send answer
                      const answerSdp = await handleOffer(data.sdp, data.fromUserId);
                      await publishSignalingAnswer(answerSdp, data.fromUserId);
                      return;
                    }

                    if (data.type === 'answer' && data.sdp) {
                      // Remote peer sent us an answer
                      await handleAnswer(data.sdp);
                      setIsNegotiating(false);
                      return;
                    }

                    if (data.type === 'ice-candidate' && data.candidate) {
                      await addIceCandidate(data.candidate);
                      return;
                    }

                    if (data.type === 'participant-left') {
                      // Participant left
                      return;
                    }
                  } catch (err) {
                    // Only catch unexpected errors, not media init failures
                    console.error('[LiveStream] Stream initialization failed:', err);
                    toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
                  }
                };

                initStream();

                // Connect to the Gateway's live signaling SSE endpoint
                if (myUserId) {
                  const token = localStorage.getItem('tone-auth-token');
                  const accessToken = token ? JSON.parse(token).access_token : null;
                  const url = `${GATEWAY_URL}/api/live/sessions/${id}/signaling`;

                  const signalingUrl = accessToken
                    ? `${url}?access_token=${encodeURIComponent(accessToken)}`
                    : url;
                  const es = new EventSource(signalingUrl, {
                    withCredentials: true,
                  });

                  esRef.current = es;

                  es.onopen = () => {
                    setSignalingConnected(true);
                    console.log('[LiveStream] Signaling connected');
                  };

                  es.onmessage = async (event) => {
                    try {
                      const data = JSON.parse(event.data);

                      if (data.type === 'init') {
                        // SSE connection initialized
                        return;
                      }

                      if (data.type === 'participant-joined') {
                        // New participant joined
                        if (data.fromUserId !== myUserId) {
                          hasViewerRef.current = true;
                          // If we're the host, create an offer for the new participant
                          if (isHost && localStream && !hasCreatedOfferRef.current) {
                            hasCreatedOfferRef.current = true;
                            console.log('[LiveStream] Creating offer for new participant');
                            const offerSdp = await createOffer();
                            setIsNegotiating(true);

                            // Publish offer via signaling
                            await publishSignalingOffer(offerSdp, data.fromUserId);
                          }
                        }
                        return;
                      }

                      if (data.type === 'session-ended') {
                        leaveStream();
                        navigate('/');
                        return;
                      }

                      // Handle WebRTC signaling messages directed at us
                      if (data.toUserId && data.toUserId !== myUserId) return;

                      if (data.type === 'offer' && data.sdp) {
                        // Remote peer sent us an offer - create and send answer
                        const answerSdp = await handleOffer(data.sdp, data.fromUserId);
                        await publishSignalingAnswer(answerSdp, data.fromUserId);
                        return;
                      }

                      if (data.type === 'answer' && data.sdp) {
                        // Remote peer sent us an answer
                        await handleAnswer(data.sdp);
                        setIsNegotiating(false);
                        return;
                      }

                      if (data.type === 'ice-candidate' && data.candidate) {
                        await addIceCandidate(data.candidate);
                        return;
                      }

                      if (data.type === 'participant-left') {
                        // Participant left
                        return;
                      }
                    } catch (err) {
                      // Only catch unexpected errors, not media init failures
                      console.error('[LiveStream] Stream initialization failed:', err);
                      toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
                    }
                  };

                  initStream();
                }, [stream, isConnected, isHost, user, initMedia, createOffer, handleOffer, handleAnswer, addIceCandidate, toast]);
              });
            });
          }
        });
      });
    };
  };

  return (
    <LiveStreamContext.Provider value={value}>
      {children}
    </LiveStreamContext.Provider>
  );
};