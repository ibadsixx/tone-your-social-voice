# Video Export Recipe - FFmpeg Pipeline

This document provides the FFmpeg command recipes for exporting editor projects.

## Prerequisites

- FFmpeg 5.0+ installed
- Node.js 18+ for the helper script
- Project JSON with video clips, audio tracks, and text layers

## Project JSON Structure

```json
{
  "tracks": [
    {
      "type": "video",
      "clips": [
        {
          "id": "clip-1",
          "src": "https://gateway-iota-two.vercel.app/storage/video1.mp4",
          "start": 0,
          "end": 10,
          "duration": 10,
          "filter": {
            "brightness": 100,
            "contrast": 100,
            "saturation": 100,
            "temperature": 0,
            "blur": 0
          }
        }
      ]
    },
    {
      "type": "audio",
      "clips": [
        {
          "id": "audio-1",
          "src": "https://gateway-iota-two.vercel.app/storage/music.mp3",
          "start": 0,
          "end": 30,
          "volume": 0.8,
          "effects": {
            "volume": 80,
            "bass": 10,
            "treble": 0,
            "reverb": 20,
            "pan": 0,
            "speed": 1
          }
        }
      ]
    },
    {
      "type": "text",
      "clips": [
        {
          "id": "text-1",
          "content": "Hello World",
          "start": 2,
          "end": 8,
          "position": { "x": 50, "y": 30 },
          "style": {
            "fontFamily": "Inter",
            "fontSize": 48,
            "color": "#ffffff",
            "fontWeight": "bold"
          }
        }
      ]
    }
  ],
  "settings": {
    "duration": 30,
    "fps": 30,
    "resolution": { "width": 1080, "height": 1920 }
  }
}
```

## Export Commands

### 1. Single Video Clip with Filters

```bash
ffmpeg -i input.mp4 \
  -vf "eq=brightness=0.1:contrast=1.2:saturation=1.1,hue=s=0" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  output.mp4
```

Filter mappings:
- `brightness`: (value - 100) / 100 → -1.0 to 1.0
- `contrast`: value / 100 → 0.0 to 2.0
- `saturation`: value / 100 → 0.0 to 2.0
- `blur`: gblur=sigma=value

### 2. Concatenate Multiple Video Clips

Create a concat file `clips.txt`:
```
file 'clip1.mp4'
file 'clip2.mp4'
file 'clip3.mp4'
```

```bash
ffmpeg -f concat -safe 0 -i clips.txt \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  output.mp4
```

### 3. Add Background Audio with Volume

```bash
ffmpeg -i video.mp4 -i music.mp3 \
  -filter_complex "[0:a]volume=1.0[a0]; [1:a]volume=0.8[a1]; [a0][a1]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k \
  -shortest \
  output.mp4
```

### 4. Audio Effects Chain

```bash
# Bass boost (lowshelf), treble cut (highshelf), reverb simulation
ffmpeg -i input.mp3 \
  -af "equalizer=f=200:t=q:w=2:g=6,equalizer=f=3000:t=q:w=2:g=-3,aecho=0.8:0.88:60:0.4" \
  output.mp3
```

### 5. Add Text Overlay (Burned-in)

```bash
ffmpeg -i video.mp4 \
  -vf "drawtext=text='Hello World':fontfile=/path/to/font.ttf:fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h*0.3:enable='between(t,2,8)'" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a copy \
  output.mp4
```

### 6. Complete Export Pipeline

```bash
#!/bin/bash

# Variables
PROJECT_ID="$1"
OUTPUT_DIR="./exports"
TEMP_DIR="./temp_${PROJECT_ID}"

mkdir -p "$TEMP_DIR" "$OUTPUT_DIR"

# 1. Download all clips
# (Use wget or curl to fetch from Supabase URLs)

# 2. Apply filters to each clip
for clip in clips/*.mp4; do
  ffmpeg -i "$clip" \
    -vf "eq=brightness=0.0:contrast=1.0:saturation=1.0" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac \
    "${TEMP_DIR}/$(basename $clip)"
done

# 3. Concatenate clips
ffmpeg -f concat -safe 0 -i "${TEMP_DIR}/clips.txt" \
  -c copy "${TEMP_DIR}/combined.mp4"

# 4. Add audio track with effects
ffmpeg -i "${TEMP_DIR}/combined.mp4" -i audio.mp3 \
  -filter_complex "[1:a]volume=0.8,equalizer=f=200:t=q:w=2:g=6[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac \
  -shortest \
  "${TEMP_DIR}/with_audio.mp4"

# 5. Add text overlays
ffmpeg -i "${TEMP_DIR}/with_audio.mp4" \
  -vf "drawtext=text='Hello':fontsize=48:fontcolor=white:x=540:y=576:enable='between(t,2,8)'" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a copy \
  "${OUTPUT_DIR}/${PROJECT_ID}.mp4"

# 6. Cleanup
rm -rf "$TEMP_DIR"

echo "Export complete: ${OUTPUT_DIR}/${PROJECT_ID}.mp4"
```

## Node.js Export Script

```javascript
// scripts/export-project.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

async function exportProject(projectJson, outputPath) {
  const project = JSON.parse(projectJson);
  const tempDir = `./temp_${Date.now()}`;
  
  fs.mkdirSync(tempDir, { recursive: true });
  
  // 1. Download clips
  const videoTrack = project.tracks.find(t => t.type === 'video');
  for (const clip of videoTrack.clips) {
    await downloadFile(clip.src, `${tempDir}/${clip.id}.mp4`);
  }
  
  // 2. Generate filter commands per clip
  const filterCommands = videoTrack.clips.map(clip => {
    const filter = clip.filter || {};
    const brightness = ((filter.brightness || 100) - 100) / 100;
    const contrast = (filter.contrast || 100) / 100;
    const saturation = (filter.saturation || 100) / 100;
    return `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`;
  });
  
  // 3. Build FFmpeg complex filter graph
  // ... (implementation depends on exact requirements)
  
  console.log('Export complete:', outputPath);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}
```

## Server-Side Integration

For production, use a job queue (Bull, Agenda) to:
1. Receive export request with project ID
2. Fetch project JSON from database
3. Download all media assets
4. Run FFmpeg pipeline
5. Upload result to storage
6. Update project status to 'done'
7. Notify user

### Supabase Edge Function Example

```typescript
// supabase/functions/render-video/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const { projectId } = await req.json();
  
  // In production: Queue this job for async processing
  // The actual FFmpeg execution should happen on a worker server
  
  return new Response(JSON.stringify({
    status: 'queued',
    projectId,
    message: 'Video export queued. You will be notified when complete.'
  }));
});
```

## Limitations

1. **Browser Export**: Not practical for long videos due to memory constraints
2. **Server Requirements**: FFmpeg must be installed on render server
3. **Text Rendering**: Requires fonts to be available on render server
4. **Processing Time**: ~1-2x realtime for 1080p encoding

## Priority Tickets

1. **HIGH**: Implement server-side render queue
2. **MEDIUM**: Add progress tracking via websockets
3. **LOW**: Client-side preview export (short clips only)
