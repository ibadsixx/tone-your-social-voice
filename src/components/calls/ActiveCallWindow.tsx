import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  Minimize2,
  Phone,
  Loader2,
} from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import { useCallAudio } from '@/hooks/useCallAudio';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ConnectionQualityIndicator: React.FC<{ 
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  roundTripTime?: number;
  packetLoss?: number;
}> = ({ level, roundTripTime, packetLoss }) => {
  const getColor = () => {
    switch (level) {
      case 'excellent': return 'text-green-500';
      case 'good': return 'text-green-400';
      case 'fair': return 'text-yellow-500';
      case 'poor': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getBars = () => {
    switch (level) {
      case 'excellent': return 4;
      case 'good': return 3;
      case 'fair': return 2;
      case 'poor': return 1;
      default: return 0;
    }
  };

  const bars = getBars();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-end gap-0.5 h-4", getColor())}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "w-1 rounded-sm transition-all",
                  i <= bars ? "bg-current" : "bg-current/20"
                )}
                style={{ height: `${i * 25}%` }}
              />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <p className="font-medium capitalize">{level} connection</p>
            {roundTripTime !== undefined && (
              <p>Latency: {roundTripTime}ms</p>
            )}
            {packetLoss !== undefined && packetLoss > 0 && (
              <p>Packet loss: {packetLoss}%</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const ActiveCallWindow: React.FC = () => {
  const {
    status,
    callType,
    remoteUser,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isMinimized,
    isOutgoing,
    callDuration,
    connectionQuality,
    endCall,
    toggleMute,
    toggleVideo,
    toggleMinimize,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle audio for outgoing calls (ringback tone)
  useCallAudio({ status, isOutgoing });

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isActive = ['calling', 'ringing', 'connecting', 'connected'].includes(status);

  if (!isActive || !remoteUser) return null;

  // Minimized view
  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        drag
        dragMomentum={false}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        className="fixed bottom-24 right-6 z-50"
      >
        <div 
          className="bg-card border border-border rounded-full shadow-2xl p-2 flex items-center gap-3 cursor-move"
          onClick={() => !isDragging && toggleMinimize()}
        >
          <Avatar className="w-12 h-12 border-2 border-tone-purple">
            <AvatarImage src={remoteUser.profilePic} />
            <AvatarFallback className="bg-tone-gradient text-white">
              {remoteUser.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="pr-3">
            <p className="text-sm font-medium truncate max-w-[100px]">
              {remoteUser.displayName}
            </p>
            <div className="flex items-center gap-2">
              {status === 'connected' ? (
                <>
                  <span className="text-xs text-green-500">{formatDuration(callDuration)}</span>
                  <ConnectionQualityIndicator 
                    level={connectionQuality.level}
                    roundTripTime={connectionQuality.roundTripTime}
                    packetLoss={connectionQuality.packetLoss}
                  />
                </>
              ) : (
                <span className="text-xs text-muted-foreground animate-pulse">
                  {status === 'calling' ? 'Calling...' : status === 'connecting' ? 'Connecting...' : 'Ringing...'}
                </span>
              )}
            </div>
          </div>

          <Button
            variant="destructive"
            size="sm"
            className="rounded-full w-10 h-10 p-0"
            onClick={(e) => {
              e.stopPropagation();
              endCall();
            }}
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  // Full call window
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-4 md:inset-auto md:bottom-6 md:right-6 md:w-[400px] md:h-[600px] z-50 flex flex-col"
      >
        <div className="relative flex-1 bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-border/50">
          {/* Remote video / Avatar */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
            {callType === 'video' && remoteStream && status === 'connected' ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center">
                {/* Animated rings for calling/connecting states */}
                <div className="relative">
                  {['calling', 'ringing', 'connecting'].includes(status) && (
                    <>
                      <motion.div
                        className="absolute inset-0 bg-tone-purple/30 rounded-full"
                        animate={{
                          scale: [1, 1.5, 1],
                          opacity: [0.5, 0, 0.5],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <motion.div
                        className="absolute inset-0 bg-tone-purple/20 rounded-full"
                        animate={{
                          scale: [1, 1.8, 1],
                          opacity: [0.3, 0, 0.3],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 0.5,
                        }}
                      />
                    </>
                  )}
                  <Avatar className="w-32 h-32 border-4 border-tone-purple/50 relative z-10">
                    <AvatarImage src={remoteUser.profilePic} />
                    <AvatarFallback className="bg-tone-gradient text-white text-4xl">
                      {remoteUser.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                
                <h3 className="text-white text-xl font-semibold mt-4">
                  {remoteUser.displayName}
                </h3>
                <p className="text-gray-400 text-sm">@{remoteUser?.username || ''}</p>
                
                {/* Status text */}
                <div className="mt-4 flex items-center gap-2">
                  {status === 'calling' && (
                    <>
                      <Loader2 className="h-4 w-4 text-tone-purple animate-spin" />
                      <span className="text-gray-400">Calling...</span>
                    </>
                  )}
                  {status === 'ringing' && (
                    <>
                      <Phone className="h-4 w-4 text-tone-purple animate-pulse" />
                      <span className="text-gray-400">Ringing...</span>
                    </>
                  )}
                  {status === 'connecting' && (
                    <>
                      <Loader2 className="h-4 w-4 text-green-500 animate-spin" />
                      <span className="text-gray-400">Connecting...</span>
                    </>
                  )}
                  {status === 'connected' && (
                    <div className="flex items-center gap-3">
                      <span className="text-green-500">{formatDuration(callDuration)}</span>
                      <ConnectionQualityIndicator 
                        level={connectionQuality.level}
                        roundTripTime={connectionQuality.roundTripTime}
                        packetLoss={connectionQuality.packetLoss}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Connection quality indicator (top right, for video calls) */}
          {status === 'connected' && callType === 'video' && (
            <div className="absolute top-4 right-16 bg-black/50 rounded-lg px-2 py-1 flex items-center gap-2">
              <span className="text-white text-xs">{formatDuration(callDuration)}</span>
              <ConnectionQualityIndicator 
                level={connectionQuality.level}
                roundTripTime={connectionQuality.roundTripTime}
                packetLoss={connectionQuality.packetLoss}
              />
            </div>
          )}

          {/* Local video preview (PiP) */}
          {callType === 'video' && localStream && !isVideoOff && (
            <motion.div
              drag
              dragMomentum={false}
              dragConstraints={{ left: 10, right: 10, top: 10, bottom: 10 }}
              className="absolute top-4 left-4 w-32 h-44 rounded-xl overflow-hidden shadow-lg border-2 border-white/20 cursor-move"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
            </motion.div>
          )}

          {/* Minimize button */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full w-10 h-10 p-0"
            onClick={toggleMinimize}
          >
            <Minimize2 className="h-5 w-5" />
          </Button>

          {/* Call controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-center gap-4">
              {/* Mute button */}
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="secondary"
                  size="lg"
                  className={cn(
                    "rounded-full w-14 h-14 p-0",
                    isMuted && "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                  )}
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
              </motion.div>

              {/* Video toggle (only for video calls) */}
              {callType === 'video' && (
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="secondary"
                    size="lg"
                    className={cn(
                      "rounded-full w-14 h-14 p-0",
                      isVideoOff && "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                    )}
                    onClick={toggleVideo}
                  >
                    {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </Button>
                </motion.div>
              )}

              {/* End call button */}
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="destructive"
                  size="lg"
                  className="rounded-full w-14 h-14 p-0 bg-red-500 hover:bg-red-600"
                  onClick={endCall}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
