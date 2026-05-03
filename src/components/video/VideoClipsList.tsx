import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Scissors, Download, Play } from "lucide-react";
import { toast } from "sonner";
import logoUrl from "@/assets/logo_rsm_lotus.png";

export interface VideoClip {
  id: string;
  start_seconds: number;
  end_seconds: number;
  title: string;
  reason: string;
  accepted?: boolean;
}

interface Props {
  videoUrl: string;
  clips: VideoClip[];
  onChange: (clips: VideoClip[]) => void;
  onStitched?: (blob: Blob) => void;
  initialStitchedUrl?: string | null;
}

const TITLE_CARD_DURATION_MS = 2000;

export function VideoClipsList({ videoUrl, clips, onChange, onStitched, initialStitchedUrl }: Props) {
  const [stitching, setStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState("");
  const [stitchedUrl, setStitchedUrl] = useState<string | null>(initialStitchedUrl || null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => { setStitchedUrl(initialStitchedUrl || null); }, [initialStitchedUrl]);

  // Preload logo
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoUrl;
    img.onload = () => { logoImgRef.current = img; };
  }, []);

  const toggle = (id: string, accepted: boolean) => {
    onChange(clips.map((c) => (c.id === id ? { ...c, accepted } : c)));
  };
  const updateTitle = (id: string, title: string) => {
    onChange(clips.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const accepted = clips.filter((c) => c.accepted);

  const drawTitleCard = (ctx: CanvasRenderingContext2D, w: number, h: number, title: string) => {
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0b1d3a");
    grad.addColorStop(1, "#1e3a8a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Logo on the left
    const logo = logoImgRef.current;
    const pad = Math.round(Math.min(w, h) * 0.06);
    const logoSize = Math.round(Math.min(w, h) * 0.35);
    if (logo && logo.complete) {
      const lx = pad;
      const ly = (h - logoSize) / 2;
      ctx.drawImage(logo, lx, ly, logoSize, logoSize);
    }

    // Title on the right
    const textX = pad * 2 + logoSize;
    const textW = w - textX - pad;
    ctx.fillStyle = "#ffffff";
    const fontSize = Math.max(28, Math.round(h * 0.07));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = "middle";

    // Word-wrap
    const words = (title || "").split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > textW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);

    const lineHeight = fontSize * 1.2;
    const totalH = lines.length * lineHeight;
    let y = h / 2 - totalH / 2 + lineHeight / 2;
    for (const l of lines) {
      ctx.fillText(l, textX, y);
      y += lineHeight;
    }
  };

  const stitch = async () => {
    if (accepted.length === 0) { toast.error("Accept at least one clip first"); return; }
    if (!sourceVideoRef.current) return;
    setStitching(true);
    if (stitchedUrl && stitchedUrl.startsWith("blob:")) URL.revokeObjectURL(stitchedUrl);
    setStitchedUrl(null);

    try {
      const video = sourceVideoRef.current;
      video.muted = false;
      video.volume = 1.0;

      if (video.readyState < 1) {
        await new Promise<void>((res, rej) => {
          video.onloadedmetadata = () => res();
          video.onerror = () => rej(new Error("Failed to load source video"));
        });
      }

      const W = video.videoWidth || 1280;
      const H = video.videoHeight || 720;

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      // Get audio track from source video (if any)
      const v: any = video;
      const sourceStream: MediaStream | null = v.captureStream
        ? v.captureStream()
        : v.mozCaptureStream?.();
      // @ts-ignore
      const canvasStream: MediaStream = canvas.captureStream(30);
      if (sourceStream) {
        for (const t of sourceStream.getAudioTracks()) canvasStream.addTrack(t);
      }

      const mimeCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { recorder.onstop = () => res(); });

      recorder.start(250);

      let drawing = true;
      const drawVideoLoop = () => {
        if (!drawing) return;
        try { ctx.drawImage(video, 0, 0, W, H); } catch {}
        requestAnimationFrame(drawVideoLoop);
      };

      for (let i = 0; i < accepted.length; i++) {
        const clip = accepted[i];
        setStitchProgress(`Clip ${i + 1}/${accepted.length}: title card`);

        // Pause video so audio is silent during title card
        video.pause();

        // Render title card frames for the duration
        drawing = false;
        const titleStart = performance.now();
        while (performance.now() - titleStart < TITLE_CARD_DURATION_MS) {
          drawTitleCard(ctx, W, H, clip.title || `Clip ${i + 1}`);
          await new Promise((r) => setTimeout(r, 50));
        }

        setStitchProgress(`Clip ${i + 1}/${accepted.length}: recording video`);
        // Seek
        video.currentTime = clip.start_seconds;
        await new Promise<void>((res) => {
          const onSeeked = () => { video.removeEventListener("seeked", onSeeked); res(); };
          video.addEventListener("seeked", onSeeked);
        });

        drawing = true;
        requestAnimationFrame(drawVideoLoop);
        await video.play();
        await new Promise<void>((res) => {
          const target = clip.end_seconds;
          const tick = () => {
            if (video.currentTime >= target || video.ended) { video.removeEventListener("timeupdate", tick); res(); }
          };
          video.addEventListener("timeupdate", tick);
        });
        drawing = false;
        video.pause();
      }

      setStitchProgress("Finalizing...");
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setStitchedUrl(url);
      onStitched?.(blob);
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
      <video
        ref={sourceVideoRef}
        src={videoUrl}
        crossOrigin="anonymous"
        preload="auto"
        playsInline
        style={{ position: "fixed", left: -99999, top: 0, width: 2, height: 2, opacity: 0, pointerEvents: "none" }}
      />

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
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-muted-foreground">{idx + 1}.</span>
                  <Input
                    value={clip.title}
                    onChange={(e) => updateTitle(clip.id, e.target.value)}
                    className="font-semibold text-base flex-1"
                    placeholder="Clip title"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {fmt(clip.start_seconds)} → {fmt(clip.end_seconds)} ({(clip.end_seconds - clip.start_seconds).toFixed(1)}s)
                </p>
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
          {accepted.length > 0 && ` Total length: ${(accepted.reduce((s, c) => s + (c.end_seconds - c.start_seconds), 0) + accepted.length * 2).toFixed(1)}s (incl. 2s title card per clip)`}
        </p>
        <Button onClick={stitch} disabled={stitching || accepted.length === 0} size="lg" className="w-full">
          {stitching ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{stitchProgress || "Stitching..."}</>
          ) : (
            <><Scissors className="mr-2 h-5 w-5" />Stitch together all clips</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Each clip starts with a 2-second title card (Srijan logo + clip title). Please don't close this tab while it's working.
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
