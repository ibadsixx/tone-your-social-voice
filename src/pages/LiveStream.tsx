import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Mic, Video, MicOff, VideoOff, Users, Globe, Lock, StopCircle } from 'lucide-react';
import { useLiveStream } from '@/contexts/LiveStreamContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

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
  } = useLiveStream();

  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Track whether media initialization has been attempted in this session,
  // to prevent duplicate getUserMedia() calls across effect re-runs.
  const hasInitMediaRef = useRef(false);
  // Track whether the stream is ending.
  const isEnding = useRef(false);

  useEffect(() => {
    // Get current user id from session
    try {
      const sessionStr = localStorage.getItem('tone-auth-token');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        setMyUserId(session?.user?.id ?? null);
      }
    } catch {
      setMyUserId(null);
    }
  }, []);

  // Initialize media when joining a stream
  // LiveKit handles all media transport natively — no SSE signaling,
  // no WebRTC offer/answer/ICE negotiation needed.
  useEffect(() => {
    if (!id || !stream || !isConnected) return;

    const initStream = async () => {
      try {
        if (isHost) {
          // Host: initialize local media
          // Media failure is not fatal — host can still
          // be in the stream as a viewer-only participant.
          if (!hasInitMediaRef.current) {
            try {
              await initMedia(stream.stream_type);
            } catch (mediaErr) {
              console.warn('[LiveStream] Host media init failed:', mediaErr);
            }
            hasInitMediaRef.current = true;
          }
        } else {
          // Viewer: initialize media (audio only for viewers)
          if (!hasInitMediaRef.current) {
            try {
              await initMedia('audio');
            } catch (mediaErr) {
              console.warn('[LiveStream] Viewer media init failed:', mediaErr);
            }
            hasInitMediaRef.current = true;
          }
        }
      } catch (err) {
        console.error('[LiveStream] Stream initialization failed:', err);
        toast({ title: 'Error', description: 'Failed to start stream', variant: 'destructive' });
      }
    };

    initStream();

    return () => {
      // NOTE: Do NOT call resetMediaInit() here. Media cleanup happens only
      // in leaveStream(). Resetting mediaInitAttemptedRef on every effect
      // re-run caused getUserMedia() to be called repeatedly.
    };
  }, [id, stream, isConnected, isHost, initMedia, toast]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-lg font-medium text-destructive">Stream Error</h1>
          <p className="text-muted-foreground mt-2">{error}</p>
          <Button onClick={() => navigate('/')} className="mt-4">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  if (!stream || !isConnected) {
    if (stream?.status === 'ended') {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
          <div className="text-center max-w-md">
            <h1 className="text-lg font-medium">Stream Ended</h1>
            <p className="text-muted-foreground mt-2">
              This live stream has ended.
            </p>
            <Button onClick={() => navigate('/')} className="mt-4">
              Back to Home
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mb-4" />
          <p className="text-muted-foreground">Connecting to live stream...</p>
        </div>
      </div>
    );
  }

  const isAudioOnly = stream.stream_type === 'audio';
  const hasRemoteStream = remoteStream !== null;
  const hasLocalStream = localStream !== null;

  // Host alone: local camera becomes the main stage video.
  // Host with guests: remote video is main, local camera becomes PiP.
  const showLocalAsMain = isHost && hasLocalStream && !hasRemoteStream;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="h-16 bg-black/80 backdrop-blur flex items-center justify-between px-4 z-20 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button
            onClick={leaveStream}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">{stream.title || 'Live Stream'}</h1>
            <p className="text-sm text-white/70">
              {stream.audience_type === 'public' ? 'Public' : 'Friends only'} • {stream.stream_type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isHost && (
            <Button
              onClick={toggleRecording}
              variant="destructive"
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white flex items-center gap-2"
            >
              {stream.recording ? <StopCircle className="w-4 h-4" /> : <StopCircle className="w-4 h-4" />}
              {stream.recording ? 'Stop Recording' : 'Record'}
            </Button>
          )}
          <Button
            onClick={endStream}
            disabled={isEnding.current}
            variant="destructive"
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            End Stream
          </Button>
        </div>
      </header>

      {/* Main Stream Area */}
      <main className="flex-1 flex items-center justify-center p-4 bg-black">
        <div className="w-full max-w-[calc(100vw-2rem)] max-h-[calc(100vh-11rem)] aspect-[9/16] bg-black rounded-xl overflow-hidden relative shadow-2xl border border-white/10">
          {isAudioOnly ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-white">
              <MicOff className="w-24 h-24 text-white/50 mb-4" />
              <div className="text-center">
                <h2 className="text-xl font-medium">{stream.title || 'Live Audio Stream'}</h2>
                <p className="text-white/70 mt-2">Audio-only stream</p>
                <div className="mt-4">
                  {hasRemoteStream && remoteStream && (
                    <audio
                      autoPlay
                      playsInline
                      ref={(el) => {
                        if (el) (el as HTMLAudioElement).srcObject = remoteStream;
                      }}
                      className="hidden"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Remote video (main display) */}
              {hasRemoteStream && remoteStream ? (
                <video autoPlay playsInline ref={(el) => { if (el) el.srcObject = remoteStream; }} className="w-full h-full object-cover" />
              ) : showLocalAsMain && localStream ? (
                <video autoPlay playsInline muted ref={(el) => { if (el) el.srcObject = localStream; }} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50">
                  <Video className="w-16 h-16 mb-4" />
                  <div className="text-center">
                    <h2 className="text-xl font-medium">Live Stream</h2>
                    <p className="text-white/70 mt-2">Waiting for stream...</p>
                  </div>
                </div>
              )}
              {/* Local video (picture-in-picture for host/guests) */}
              {!isAudioOnly && hasLocalStream && localStream && !showLocalAsMain && (
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={(el) => { if (el) el.srcObject = localStream; }}
                  className="absolute bottom-4 right-4 w-48 h-64 object-cover border border-white/20 rounded-lg shadow-lg"
                />
              )}
              <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs text-white/90 border border-white/20">
                LIVE
              </div>
            </>
          )}
        </div>
      </main>

      {/* Controls */}
      <footer className="h-20 bg-black/80 backdrop-blur flex items-center justify-between px-6 z-20 border-t border-white/10">
        <div className="flex items-center gap-4">
          {!isAudioOnly ? (
            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full transition-colors ${isVideoOff ? 'text-white/40' : 'text-white'}`}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
          ) : null}
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full transition-colors ${isMuted ? 'text-white/40' : 'text-white'}`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs text-white/90">
            <Users className="w-3 h-3 mr-1" />
            {viewerCount} watching
          </div>
          <div className="hidden md:flex items-center gap-2">
            {participants.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 border border-white/10 text-[10px] text-white/90"
              >
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span>{p.role === 'host' ? 'Host' : p.role.charAt(0).toUpperCase() + p.role.slice(1)}</span>
                {p.is_muted && <MicOff className="w-3 h-3 text-white/60" />}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stream.audience_type === 'public' ? (
              <div className="px-2 py-1 rounded bg-blue-500/20 border border-blue-500/30 text-xs text-blue-100">
                <Globe className="w-3 h-3 mr-1" />
                Public
              </div>
            ) : (
              <div className="px-2 py-1 rounded bg-lock/20 border border-lock/30 text-xs text-lock/100">
                <Lock className="w-3 h-3 mr-1" />
                Friends
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LiveStream;
