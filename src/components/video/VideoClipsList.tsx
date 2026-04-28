import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Scissors, Download, Play } from "lucide-react";
import { toast } from "sonner";

export interface VideoClip {
  id: string;
  start_seconds: number;
  end_seconds: number;
  title: string;
  reason: string;
  accepted?: boolean;
}

interface Props {
  videoUrl: string; // signed URL of the source video
  clips: VideoClip[];
  onChange: (clips: VideoClip[]) => void;
}

export function VideoClipsList({ videoUrl, clips, onChange }: Props) {
  const [stitching, setStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState("");
  const [stitchedUrl, setStitchedUrl] = useState<string | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => { if (stitchedUrl) URL.revokeObjectURL(stitchedUrl); };
  }, [stitchedUrl]);

  const toggle = (id: string, accepted: boolean) => {
    onChange(clips.map((c) => (c.id === id ? { ...c, accepted } : c)));
  };

  const accepted = clips.filter((c) => c.accepted);

  const stitch = async () => {
    if (accepted.length === 0) { toast.error("Accept at least one clip first"); return; }
    if (!sourceVideoRef.current) return;
    setStitching(true);
    setStitchedUrl(null);
    try {
      const video = sourceVideoRef.current;
      video.muted = false;
      video.volume = 1.0;

      // Wait for metadata
      if (video.readyState < 1) {
        await new Promise<void>((res, rej) => {
          video.onloadedmetadata = () => res();
          video.onerror = () => rej(new Error("Failed to load source video"));
        });
      }

      // captureStream gives us both video + audio tracks from the playing element
      // @ts-ignore
      const stream: MediaStream = video.captureStream ? video.captureStream() : (video as any).mozCaptureStream();
      if (!stream) throw new Error("captureStream not supported in this browser");

      const mimeCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { recorder.onstop = () => res(); });

      recorder.start(250);

      for (let i = 0; i < accepted.length; i++) {
        const clip = accepted[i];
        setStitchProgress(`Recording clip ${i + 1} of ${accepted.length}: ${clip.title}`);
        // Seek
        video.pause();
        video.currentTime = clip.start_seconds;
        await new Promise<void>((res) => {
          const onSeeked = () => { video.removeEventListener("seeked", onSeeked); res(); };
          video.addEventListener("seeked", onSeeked);
        });
        await video.play();
        // Wait for the clip duration (real time playback)
        await new Promise<void>((res) => {
          const target = clip.end_seconds;
          const tick = () => {
            if (video.currentTime >= target || video.ended) { video.removeEventListener("timeupdate", tick); res(); }
          };
          video.addEventListener("timeupdate", tick);
        });
        video.pause();
      }

      setStitchProgress("Finalizing video...");
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setStitchedUrl(url);
      toast.success("Short stitched! Preview and download below.");
    } catch (e) {
      console.error("Stitch failed:", e);
      toast.error(e instanceof Error ? e.message : "Stitching failed");
    } finally {
      setStitching(false);
      setStitchProgress("");
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = (s - m * 60).toFixed(1);
    return `${m}:${sec.padStart(4, "0")}`;
  };

  return (
    <div className="space-y-4">
      {/* Hidden source video used for stitching */}
      <video ref={sourceVideoRef} src={videoUrl} crossOrigin="anonymous" preload="auto" playsInline className="hidden" />

      <div className="space-y-3">
        {clips.map((clip, idx) => (
          <Card key={clip.id} className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-64">
                <video
                  src={`${videoUrl}#t=${clip.start_seconds},${clip.end_seconds}`}
                  controls
                  preload="metadata"
                  className="w-full rounded-md border bg-black"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {idx + 1}. {clip.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmt(clip.start_seconds)} → {fmt(clip.end_seconds)} ({(clip.end_seconds - clip.start_seconds).toFixed(1)}s)
                    </p>
                  </div>
                </div>
                <p className="text-sm mt-2 text-muted-foreground">{clip.reason}</p>
                <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none">
                  <Checkbox
                    checked={!!clip.accepted}
                    onCheckedChange={(v) => toggle(clip.id, v === true)}
                  />
                  <span>Accept this clip</span>
                </label>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="pt-4 border-t">
        <p className="text-sm text-muted-foreground mb-3">
          {accepted.length} of {clips.length} clip(s) accepted.
          {accepted.length > 0 && ` Total length: ${accepted.reduce((s, c) => s + (c.end_seconds - c.start_seconds), 0).toFixed(1)}s`}
        </p>
        <Button onClick={stitch} disabled={stitching || accepted.length === 0} size="lg" className="w-full">
          {stitching ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{stitchProgress || "Stitching..."}</>
          ) : (
            <><Scissors className="mr-2 h-5 w-5" />Stitch together all clips</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Stitching plays each clip in real time in your browser — please don't close this tab while it's working.
        </p>
      </div>

      {stitchedUrl && (
        <Card className="p-4 mt-4 border-primary">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Play className="h-4 w-4" />Your stitched short</h3>
          <video src={stitchedUrl} controls className="w-full rounded-md border bg-black max-h-[500px]" />
          <a href={stitchedUrl} download="youtube-short.webm" className="inline-block mt-3">
            <Button variant="outline"><Download className="mr-2 h-4 w-4" />Download (.webm)</Button>
          </a>
        </Card>
      )}
    </div>
  );
}
