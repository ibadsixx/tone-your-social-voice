import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Mic, Video, MicOff, VideoOff, Users, Globe, Lock, StopCircle, Hand } from 'lucide-react';
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
    raiseHand,
    lowerHand,
    getDevices,
    switchCamera,
    switchMicrophone,
    devices,
    raisedHand,
    updateParticipantRole,
    dismissHand,
    peerCount,
  } = useLiveStream();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);

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

  // Load available media devices on mount
  useEffect(() => {
    getDevices();
  }, [getDevices]);

  // The host publishes local media; P2P peers are negotiated by the signaling
  // layer. Viewers/listeners are subscribe-only and acquire no local tracks,
  // so frontend state alone cannot grant publishing permission.
  useEffect(() => {
    if (!id || !stream || !isConnected || !isHost) return;
    if (hasInitMediaRef.current) return;

    hasInitMediaRef.current = true;
    (async () => {
      try {
        await initMedia(stream.stream_type);
      } catch (mediaErr) {
        console.warn('[LiveStream] Host media init failed:', mediaErr);
      }
    })();
  }, [id, stream, isConnected, isHost, initMedia, toast]);

  // A listener promoted to speaker/guest by the Gateway may publish. This is
  // driven by the server-authoritative role in the participants list.
  useEffect(() => {
    if (!myUserId || isHost || !isConnected || localStream) return;
    const own = participants.find((p) => p.user_id === myUserId);
    if (!own || (own.role !== 'guest' && own.role !== 'moderator')) return;
    if (hasInitMediaRef.current) return;
    hasInitMediaRef.current = true;
    initMedia(stream?.stream_type === 'video' ? 'video' : 'audio').catch((error) => {
      console.warn('[LiveStream] Speaker media init failed:', error);
    });
  }, [myUserId, isHost, isConnected, localStream, participants, stream, initMedia]);

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

  const videoDevices = devices.filter((d) => d.kind === 'videoinput');
  const audioDevices = devices.filter((d) => d.kind === 'audioinput');

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

      {/* Speaking requests — Gateway-authorized role changes only */}
      {isHost && participants.some((p) => p.raised_hand) && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center gap-3 overflow-x-auto">
          <Hand className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-200 shrink-0">Speaking requests:</span>
          {participants.filter((p) => p.raised_hand).map((p) => (
            <div key={p.user_id} className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-white/80">{p.user_id.slice(0, 8)}</span>
              <button
                onClick={() => updateParticipantRole(p.user_id, 'guest')}
                className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-200 hover:bg-green-500/30"
              >
                Accept
              </button>
              <button
                onClick={() => dismissHand(p.user_id)}
                className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/70 hover:bg-white/20"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Stream Area */}
      <main className="flex-1 flex items-center justify-center p-4 bg-black">
        <div className="w-full max-w-[calc(100vw-2rem)] max-h-[calc(100vh-11rem)] aspect-[9/16] bg-black rounded-xl overflow-hidden relative shadow-2xl border border-white/10">
          {isAudioOnly ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-white">
              {raisedHand ? (
                <div className="animate-pulse">
                  <Hand className="w-24 h-24 text-yellow-400 mb-4" />
                  <p className="text-yellow-400 text-sm font-medium">Hand Raised</p>
                </div>
              ) : (
                <MicOff className="w-24 h-24 text-white/50 mb-4" />
              )}
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
          <button
            onClick={raisedHand ? lowerHand : raiseHand}
            className={`p-3 rounded-full transition-colors ${raisedHand ? 'text-yellow-400' : 'text-white/70'}`}
            title={raisedHand ? 'Lower Hand' : 'Raise Hand'}
          >
            <Hand className="w-5 h-5" />
          </button>
          {/* Device selection dropdown */}
          <div className="relative">
            <button
              onClick={() => setDeviceMenuOpen(!deviceMenuOpen)}
              className="p-3 rounded-full hover:bg-white/10 transition-colors text-white/70"
              title="Device Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            {deviceMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 bg-black/90 border border-white/20 rounded-lg p-2 w-64 backdrop-blur">
                {videoDevices.length > 0 && (
                  <>
                    <div className="text-xs text-white/40 mb-1">Camera</div>
                    <select
                      value=""
                      onChange={(e) => switchCamera(e.target.value)}
                      className="w-full text-sm bg-black/50 border border-white/10 rounded px-2 py-1 text-white"
                    >
                      {videoDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || 'Camera'}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {audioDevices.length > 0 && (
                  <>
                    <div className="text-xs text-white/40 mb-1 mt-2">Microphone</div>
                    <select
                      value=""
                      onChange={(e) => switchMicrophone(e.target.value)}
                      className="w-full text-sm bg-black/50 border border-white/10 rounded px-2 py-1 text-white"
                    >
                      {audioDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || 'Microphone'}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs text-white/90">
            <Users className="w-3 h-3 mr-1" />
            {viewerCount} watching
            <span className="ml-2 text-white/50">P2P peers: {peerCount}</span>
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
                {p.raised_hand && <span className="text-yellow-400 text-[10px] ml-1">✋</span>}
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