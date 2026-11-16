import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Mic, Video, MicOff, VideoOff, Users, Globe, Users as UsersIcon, Lock, StopCircle } from 'lucide-react';
import { useLiveStream } from '@/contexts/LiveStreamContext';
import { Button } from '@/components/ui/button';

const LiveStream = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    stream,
    participants,
    isHost,
    isConnected,
    localStream,
    isMuted,
    isVideoOff,
    viewerCount,
    error,
    endStream,
    toggleRecording,
    toggleMute,
    toggleVideo,
    leaveStream,
    addParticipant,
    removeParticipant,
    updateParticipantRole,
  } = useLiveStream();

  useEffect(() => {
    if (id) {
      // Join the stream - the joinStream method handles both host and viewer joining
    }
    return () => {
      // Leave when unmounting
      leaveStream();
    };
  }, [id, leaveStream]);

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
  const streamUrl = `https://live.tone.app/stream/${stream.id}`; // Placeholder - actual URL depends on provider

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
        <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden relative shadow-2xl border border-white/10">
          {isAudioOnly ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-white">
              <MicOff className="w-24 h-24 text-white/50 mb-4" />
              <div className="text-center">
                <h2 className="text-xl font-medium">{stream.title || 'Live Audio Stream'}</h2>
                <p className="text-white/70 mt-2">Audio-only stream</p>
              </div>
            </div>
          ) : (
            <>
              {/* Placeholder video - actual media depends on provider */}
              <div className="w-full h-full flex items-center justify-center text-white/50">
                <Video className="w-16 h-16 mb-4" />
                <div className="text-center">
                  <h2 className="text-xl font-medium">Live Stream</h2>
                  <p className="text-white/70 mt-2">Streaming media will appear here once provider is integrated</p>
                </div>
              </div>
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
          {stream.stream_type !== 'audio' ? (
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
            <UsersIcon className="w-3 h-3 mr-1" />
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
