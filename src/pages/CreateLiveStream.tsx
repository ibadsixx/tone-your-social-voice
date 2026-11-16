import { useState } from 'react';
import { ArrowLeft, Mic, Video, MicOff, VideoOff, Record, Globe, Users, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLiveStream } from '@/contexts/LiveStreamContext';
import { AudienceSummary, AudienceSelector, type AudienceSelection } from '@/components/AudienceSelector';

type StreamType = 'video' | 'audio';

const streamTypeOptions = [
  { value: 'video', label: 'Video & Audio', icon: Video },
  { value: 'audio', label: 'Audio Only', icon: Mic },
];

const CreateLiveStream = () => {
  const navigate = useNavigate();
  const { startStream } = useLiveStream();
  const [streamType, setStreamType] = useState<StreamType>('video');
  const [audience, setAudience] = useState<AudienceSelection>({ type: 'public' });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showAudienceSelector, setShowAudienceSelector] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      await startStream({
        title: title.trim(),
        description: description.trim() || undefined,
        stream_type: streamType,
        audience_type: audience.type,
        audience_user_ids: audience.audience_user_ids,
        audience_excluded_user_ids: audience.audience_excluded_user_ids,
        audience_list_id: audience.audience_list_id,
        recording: false,
      });
      navigate(`/live/${/* stream id will be set by context */ ''}`, { replace: true });
    } catch {
      // Error already toasted by context
    } finally {
      setIsCreating(false);
    }
  };

  const handleAudienceSelect = (newAudience: AudienceSelection) => {
    setAudience(newAudience);
    setShowAudienceSelector(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background border-b px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 rounded-full hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base">Create Live Stream</h1>
        </div>
        <AudienceSummary
          audience={audience}
          className="cursor-pointer hover:bg-accent/50 px-2 py-1 rounded-md transition-colors text-xs"
          onClick={() => setShowAudienceSelector(true)}
        />
      </header>
      <main className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Stream Type */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Stream Type</h2>
            <div className="flex gap-2">
              {streamTypeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStreamType(option.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    streamType === option.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:bg-muted/50'
                  }`}
                >
                  {option.value === 'audio' ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Video className="w-4 h-4" />
                  )}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Stream Title</label>
            <input
              type="text"
              placeholder="What are you live about?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary outline-none"
              maxLength="200"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <textarea
              placeholder="Tell people what your live stream is about..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary outline-none"
              rows={3}
              maxLength="500"
            />
          </div>

          {/* Audience */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Audience</label>
            <button
              onClick={() => setShowAudienceSelector(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background hover:bg-accent/50 text-sm"
            >
              <Globe className="w-4 h-4" />
              <span>{audience.type.charAt(0).toUpperCase() + audience.type.slice(1)}</span>
            </button>
          </div>

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={isCreating || !title.trim()}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l5.291-5.291A7.962 7.962 0 0112 16.791z"></path>
                </svg>
              </>
            ) : (
              <>
                {streamType === 'audio' ? <Mic className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                {' '}
                {isCreating ? 'Starting Stream...' : 'Start Live Stream'}
              </>
            )}
          </button>
        </div>
      </main>

      {/* Audience Selector */}
      <AudienceSelector
        open={showAudienceSelector}
        onOpenChange={setShowAudienceSelector}
        onSelect={handleAudienceSelect}
        currentSelection={audience}
      />
    </div>
  );
};

export default CreateLiveStream;
