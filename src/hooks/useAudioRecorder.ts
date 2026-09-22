import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface AudioRecording {
  blob: Blob;
  duration: number;
  url: string;
}

export const useAudioRecorder = (options?: { maxDurationSeconds?: number }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const { toast } = useToast();

  // Optional time-based auto-stop. `0` (used by the message voice composer)
  // means "no time limit" — the user can record as long as the mic hardware
  // and the storage size limit allow. The editor voice-over recorder keeps the
  // original 60s cap by not passing any option. Read through a ref so the
  // timer callbacks stay stable (as they were when the cap was a literal).
  const maxDurationRef = useRef(options?.maxDurationSeconds ?? 60);
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      // Check MediaRecorder support
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        toast({
          title: "Not Supported",
          description: "Voice recording is not supported in this browser",
          variant: "destructive"
        });
        return false;
      }

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      // Set up audio level monitoring
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Monitor audio level
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateAudioLevel = () => {
        if (analyserRef.current && isRecording) {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
          setAudioLevel(average / 255);
          requestAnimationFrame(updateAudioLevel);
        }
      };

      // Create MediaRecorder
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/mpeg'
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported audio format found');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        bitsPerSecond: 128000 // 128 kbps
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();

      // Start timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
        
        // Auto-stop at max duration (only when a time limit is configured)
        if (maxDurationRef.current > 0 && elapsed >= maxDurationRef.current) {
          stopRecording();
        }
      }, 100);

      // Start audio level monitoring
      requestAnimationFrame(updateAudioLevel);

      return true;
    } catch (error: any) {
      console.error('Error starting recording:', error);
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Permission Denied",
          description: "Please allow microphone access to record voice messages",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Recording Error",
          description: error.message || "Failed to start recording",
          variant: "destructive"
        });
      }
      
      return false;
    }
  }, [isRecording, toast]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      
      // Resume timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
        
        if (maxDurationRef.current > 0 && elapsed >= maxDurationRef.current) {
          stopRecording();
        }
      }, 100);
    }
  }, [isRecording, isPaused]);

  const stopRecording = useCallback((): Promise<AudioRecording | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        
        // Check file size
        if (blob.size > MAX_SIZE) {
          toast({
            title: "File Too Large",
            description: `Recording exceeds ${MAX_SIZE / (1024 * 1024)}MB limit`,
            variant: "destructive"
          });
          resolve(null);
          return;
        }

        const url = URL.createObjectURL(blob);
        const recording: AudioRecording = {
          blob,
          duration: recordingTime,
          url
        };
        
        resolve(recording);
      };

      // Stop recording
      mediaRecorder.stop();
      
      // Clean up
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioLevel(0);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      analyserRef.current = null;
      mediaRecorderRef.current = null;
    });
  }, [isRecording, recordingTime, toast]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      // Clean up without saving
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioLevel(0);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      analyserRef.current = null;
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    }
  }, [isRecording]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (isRecording) {
      cancelRecording();
    }
  }, [isRecording, cancelRecording]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    isRecording,
    isPaused,
    recordingTime,
    audioLevel,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    cleanup,
    formatTime,
    maxDuration: maxDurationRef.current,
    maxSize: MAX_SIZE
  };
};