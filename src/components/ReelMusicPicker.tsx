import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Music, Search, X, Link as LinkIcon, Youtube, Music2, AlertCircle, TrendingUp, Trophy } from 'lucide-react';
import { detectMusicUrl, MusicSourceType } from '@/utils/musicUrlDetector';
import { extractMusicMetadata } from '@/utils/musicMetadataExtractor';
import { useMusicLibrary } from '@/hooks/useMusicLibrary';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { MusicTrimmer } from '@/components/music/MusicTrimmer';

interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  duration: number | null;
  usage_count?: number;
  weekly_usage?: number;
  is_trending?: boolean;
  thumbnail_url?: string | null;
  source_type?: string;
}

interface MusicData {
  url: string;
  title: string;
  artist?: string;
  startAt: number;
  endAt: number;
  duration: number;
  source_type: string;
  video_id?: string | null;
  thumbnail_url?: string | null;
}

interface ReelMusicPickerProps {
  onSelectMusic: (music: MusicData | null) => void;
  selectedMusic?: MusicData | null;
  maxDuration?: number; // Max duration for reels (default 60s)
}

const ReelMusicPicker = ({ onSelectMusic, selectedMusic, maxDuration = 60 }: ReelMusicPickerProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [endAt, setEndAt] = useState(Math.min(maxDuration, 60));
  const [showTrimmer, setShowTrimmer] = useState(false);

  const { tracks, trendingTracks, weeklyTopTracks, isLoading, addOrIncrement } = useMusicLibrary();

  const filteredMusic = tracks.filter(
    (track) =>
      track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (track.artist && track.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSelectMusic = async (track: MusicTrack) => {
    try {
      console.log('[Reel Music Picker] Selecting music:', track.title);
      await addOrIncrement({
        url: track.url,
        title: track.title,
        artist: track.artist || undefined,
        duration: track.duration || undefined,
        thumbnail_url: track.thumbnail_url || undefined,
      });
      console.log('[Reel Music Picker] Music selected successfully');
      setSelectedTrack(track);
      setShowTrimmer(true);
    } catch (error) {
      console.error('[Reel Music Picker] Failed to select music:', error);
      setUrlError(error instanceof Error ? error.message : 'Failed to add music to library');
    }
  };

  const handleConfirmMusic = () => {
    if (!selectedTrack) return;
    
    const urlInfo = detectMusicUrl(selectedTrack.url);
    const duration = endAt - startAt;
    
    onSelectMusic({
      url: selectedTrack.url,
      title: selectedTrack.title,
      artist: selectedTrack.artist || undefined,
      startAt,
      endAt,
      duration,
      source_type: urlInfo.type,
      video_id: urlInfo.videoId,
      thumbnail_url: selectedTrack.thumbnail_url || undefined,
    });
    setOpen(false);
    setShowTrimmer(false);
    setSelectedTrack(null);
    setStartAt(0);
    setEndAt(Math.min(maxDuration, 60));
  };

  const handleRemoveMusic = () => {
    onSelectMusic(null);
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) {
      setUrlError('Please enter a URL');
      return;
    }

    const urlInfo = detectMusicUrl(urlInput);
    
    if (!urlInfo.isValid) {
      setUrlError(urlInfo.error || 'Invalid URL');
      return;
    }

    setIsExtracting(true);
    setUrlError('');

    try {
      console.log('[Reel Music Picker] Extracting metadata for:', urlInput);
      const metadata = await extractMusicMetadata(urlInput);
      console.log('[Reel Music Picker] Metadata extracted:', metadata);

      console.log('[Reel Music Picker] Adding music to library');
      await addOrIncrement({
        url: urlInput,
        title: metadata.title,
        artist: metadata.artist,
        duration: metadata.duration || undefined,
        thumbnail_url: metadata.thumbnail || undefined,
      });
      console.log('[Reel Music Picker] Music added successfully');

      setSelectedTrack({
        id: 'temp',
        title: metadata.title,
        artist: metadata.artist,
        url: urlInput,
        duration: metadata.duration,
        thumbnail_url: metadata.thumbnail,
      });
      setUrlInput('');
      setShowTrimmer(true);
    } catch (error) {
      console.error('[Reel Music Picker] Failed to add music:', error);
      setUrlError(error instanceof Error ? error.message : 'Failed to add music. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const getSourceIcon = (type: MusicSourceType) => {
    switch (type) {
      case 'youtube':
        return <Youtube className="h-4 w-4 text-red-500" />;
      case 'soundcloud':
        return <Music2 className="h-4 w-4 text-orange-500" />;
      case 'spotify':
        return <Music className="h-4 w-4 text-green-500" />;
      default:
        return <Music className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div className="flex items-center gap-2">
      {selectedMusic ? (
        <div className="flex items-center gap-2 bg-secondary rounded-md px-3 py-2 flex-1">
          {selectedMusic.url.startsWith('http') ? 
            getSourceIcon(detectMusicUrl(selectedMusic.url).type) : 
            <Music className="h-4 w-4 text-primary" />
          }
          <span className="text-sm flex-1 truncate">{selectedMusic.title}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleRemoveMusic}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Music className="h-4 w-4" />
              Add Music
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Add Music to Reel</DialogTitle>
            </DialogHeader>
            
            {showTrimmer && selectedTrack ? (
              <div className="space-y-4 overflow-y-auto flex-1">
                <div className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                  {selectedTrack.thumbnail_url && (
                    <img src={selectedTrack.thumbnail_url} alt="" className="w-16 h-16 rounded object-cover"  loading="lazy" decoding="async" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedTrack.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{selectedTrack.artist}</p>
                  </div>
                </div>

                <MusicTrimmer
                  duration={Math.min(selectedTrack.duration || 300, 300)}
                  onSelectSegment={(start, end) => {
                    setStartAt(start);
                    setEndAt(end);
                  }}
                  initialStart={startAt}
                  initialEnd={endAt}
                  maxSegmentDuration={maxDuration}
                />

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Select up to {maxDuration} seconds of the track for your reel.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    setShowTrimmer(false);
                    setSelectedTrack(null);
                  }} className="flex-1">
                    Back
                  </Button>
                  <Button onClick={handleConfirmMusic} className="flex-1">
                    Add to Reel
                  </Button>
                </div>
              </div>
            ) : (
              <Tabs defaultValue="url" className="w-full flex flex-col flex-1 overflow-hidden">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="url">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    URL
                  </TabsTrigger>
                  <TabsTrigger value="library">
                    <Music className="h-4 w-4 mr-2" />
                    Library
                  </TabsTrigger>
                  <TabsTrigger value="weekly">
                    <Trophy className="h-4 w-4 mr-2" />
                    Top Weekly
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="url" className="space-y-4 mt-4">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Paste a link from YouTube or SoundCloud
                    </p>
                    
                    <div className="space-y-2">
                      <Input
                        placeholder="https://youtube.com/watch?v=..."
                        value={urlInput}
                        onChange={(e) => {
                          setUrlInput(e.target.value);
                          setUrlError('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                      />
                      
                      {urlError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{urlError}</AlertDescription>
                        </Alert>
                      )}
                      
                      {urlInput && !urlError && detectMusicUrl(urlInput).isValid && (
                        <div className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm">
                          {getSourceIcon(detectMusicUrl(urlInput).type)}
                          <span className="capitalize">{detectMusicUrl(urlInput).type} detected</span>
                        </div>
                      )}
                    </div>

                    <Button 
                      onClick={handleUrlSubmit} 
                      className="w-full"
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <>
                          <Music className="h-4 w-4 mr-2 animate-pulse" />
                          Adding Music...
                        </>
                      ) : (
                        'Add Music Link'
                      )}
                    </Button>

                    <div className="pt-2 space-y-2">
                      <p className="text-xs text-muted-foreground font-semibold">Supported sources:</p>
                      <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded">
                          <Youtube className="h-3 w-3" /> YouTube
                        </div>
                        <div className="flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded">
                          <Music2 className="h-3 w-3" /> SoundCloud
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="library" className="space-y-4 mt-4 flex-1 overflow-hidden flex flex-col">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search music library..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center h-[350px]">
                      <Music className="h-8 w-8 animate-pulse text-muted-foreground" />
                    </div>
                  ) : (
                    <ScrollArea className="flex-1 rounded-md border">
                      <div className="p-4 space-y-4">
                        {trendingTracks.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-orange-500" />
                              Trending
                            </h3>
                            <div className="space-y-2">
                              {trendingTracks.slice(0, 5).map((track) => (
                                <button
                                  key={track.id}
                                  onClick={() => handleSelectMusic(track)}
                                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
                                >
                                  {track.thumbnail_url && (
                                    <img src={track.thumbnail_url} alt="" className="w-12 h-12 rounded object-cover"  loading="lazy" decoding="async" />
                                  )}
                                  <div className="flex-1 text-left min-w-0">
                                    <p className="font-medium text-sm truncate">{track.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="secondary">{track.usage_count} uses</Badge>
                                    {track.source_type && getSourceIcon(track.source_type as MusicSourceType)}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <h3 className="text-sm font-semibold mb-3">
                            {searchQuery ? 'Search Results' : 'All Music'}
                          </h3>
                          {filteredMusic.length > 0 ? (
                            <div className="space-y-2">
                              {filteredMusic.map((track) => (
                                <button
                                  key={track.id}
                                  onClick={() => handleSelectMusic(track)}
                                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
                                >
                                  {track.thumbnail_url && (
                                    <img src={track.thumbnail_url} alt="" className="w-12 h-12 rounded object-cover"  loading="lazy" decoding="async" />
                                  )}
                                  <div className="flex-1 text-left min-w-0">
                                    <p className="font-medium text-sm truncate">{track.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="secondary">{track.usage_count} uses</Badge>
                                    {track.source_type && getSourceIcon(track.source_type as MusicSourceType)}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              {searchQuery ? 'No results found' : 'No music in library yet'}
                            </p>
                          )}
                        </div>
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>

                <TabsContent value="weekly" className="space-y-4 mt-4 flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
                    <Trophy className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Top Music This Week</p>
                      <p className="text-xs text-muted-foreground">Most used songs in the last 7 days</p>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center h-[350px]">
                      <Music className="h-8 w-8 animate-pulse text-muted-foreground" />
                    </div>
                  ) : (
                    <ScrollArea className="flex-1 rounded-md border">
                      <div className="p-4 space-y-2">
                        {weeklyTopTracks.length > 0 ? (
                          weeklyTopTracks.map((track, index) => (
                            <button
                              key={track.id}
                              onClick={() => handleSelectMusic(track)}
                              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
                            >
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 font-bold text-sm">
                                {index + 1}
                              </div>
                              {track.thumbnail_url && (
                                <img src={track.thumbnail_url} alt="" className="w-12 h-12 rounded object-cover"  loading="lazy" decoding="async" />
                              )}
                              <div className="flex-1 text-left min-w-0">
                                <p className="font-medium text-sm truncate">{track.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="secondary">{track.weekly_usage} uses this week</Badge>
                                {track.source_type && getSourceIcon(track.source_type as MusicSourceType)}
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No music used this week yet
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ReelMusicPicker;
