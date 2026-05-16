import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Download, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo_rsm_lotus.png";

interface CaptionSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

interface Props {
  referenceFileId: string;
  videoUrl: string;
  defaultTitle: string;
  onStitched?: (blob: Blob) => void;
  initialStitchedUrl?: string | null;
}

const TITLE_CARD_DURATION_MS = 2000;

export function ShortBuilder({ referenceFileId, videoUrl, defaultTitle, onStitched, initialStitchedUrl }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [segments, setSegments] = useState<CaptionSegment[] | null>(null);
  const [stitchedUrl, setStitchedUrl] = useState<string | null>(initialStitchedUrl || null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => setStitchedUrl(initialStitchedUrl || null), [initialStitchedUrl]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoUrl;
    img.onload = () => { logoImgRef.current = img; };
  }, []);

  const drawTitleCard = (ctx: CanvasRenderingContext2D, w: number, h: number, t: string) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0b1d3a");
    grad.addColorStop(1, "#1e3a8a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const logo = logoImgRef.current;
    const pad = Math.round(Math.min(w, h) * 0.06);
    const logoSize = Math.round(Math.min(w, h) * 0.35);
    if (logo && logo.complete) {
      ctx.drawImage(logo, pad, (h - logoSize) / 2, logoSize, logoSize);
    }

    const textX = pad * 2 + logoSize;
    const textW = w - textX - pad;
    ctx.fillStyle = "#ffffff";
    const fontSize = Math.max(28, Math.round(h * 0.07));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = "middle";

    const words = (t || "").split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > textW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);

    const lineHeight = fontSize * 1.2;
    const totalH = lines.length * lineHeight;
    let y = h / 2 - totalH / 2 + lineHeight / 2;
    for (const l of lines) { ctx.fillText(l, textX, y); y += lineHeight; }
  };

  const drawCaption = (ctx: CanvasRenderingContext2D, w: number, h: number, text: string) => {
    if (!text) return;
    const fontSize = Math.max(22, Math.round(h * 0.045));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";

    // Word-wrap to ~80% width
    const maxW = w * 0.8;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);

    const lineHeight = fontSize * 1.25;
    const padX = Math.round(fontSize * 0.6);
    const padY = Math.round(fontSize * 0.35);
    const totalH = lines.length * lineHeight;
    const bottomMargin = Math.round(h * 0.08);
    const blockTop = h - bottomMargin - totalH - padY;

    // Background bar(s)
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    lines.forEach((l, i) => {
      const tw = ctx.measureText(l).width;
      const bx = (w - tw) / 2 - padX;
      const by = blockTop + i * lineHeight - padY / 2;
      ctx.fillRect(bx, by, tw + padX * 2, lineHeight + padY);
    });

    // Text
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 6;
    lines.forEach((l, i) => {
      ctx.fillText(l, w / 2, blockTop + i * lineHeight + fontSize);
    });
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  };

  const ensureSegments = async (): Promise<CaptionSegment[]> => {
    if (segments) return segments;
    setProgress("Transcribing captions with Gemini (this can take 1-2 minutes)...");
    const { data, error } = await supabase.functions.invoke("transcribe-video-captions", {
      body: { reference_file_id: referenceFileId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const segs = (data?.segments || []) as CaptionSegment[];
    setSegments(segs);
    return segs;
  };

  const buildShort = async () => {
    if (!sourceVideoRef.current) return;
    setBusy(true);
    if (stitchedUrl && stitchedUrl.startsWith("blob:")) URL.revokeObjectURL(stitchedUrl);
    setStitchedUrl(null);

    try {
      const segs = await ensureSegments();
      setProgress("Preparing video...");

      const video = sourceVideoRef.current;
      video.muted = true;
      video.volume = 1.0;

      if (video.readyState < 2) {
        await new Promise<void>((res, rej) => {
          const ok = () => { cleanup(); res(); };
          const err = () => { cleanup(); rej(new Error("Failed to load source video")); };
          const cleanup = () => { video.removeEventListener("loadeddata", ok); video.removeEventListener("error", err); };
          video.addEventListener("loadeddata", ok);
          video.addEventListener("error", err);
          try { video.load(); } catch {}
        });
      }

      const W = video.videoWidth || 1280;
      const H = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      // Initial frame so captureStream has content
      drawTitleCard(ctx, W, H, title || "Your Short");

      const v: any = video;
      let sourceStream: MediaStream | null = null;
      try { sourceStream = v.captureStream ? v.captureStream() : v.mozCaptureStream?.(); } catch {}
      // @ts-ignore
      const canvasStream: MediaStream = canvas.captureStream(30);
      if (sourceStream) {
        for (const t of sourceStream.getAudioTracks()) {
          try { canvasStream.addTrack(t); } catch {}
        }
      }

      const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { recorder.onstop = () => res(); });

      recorder.start(250);

      // Title card phase
      setProgress("Rendering title card...");
      try { video.pause(); } catch {}
      const titleStart = performance.now();
      while (performance.now() - titleStart < TITLE_CARD_DURATION_MS) {
        drawTitleCard(ctx, W, H, title || "Your Short");
        await new Promise((r) => setTimeout(r, 40));
      }

      // Video phase with captions
      setProgress("Recording video with captions...");
      await new Promise<void>((res) => {
        const onSeeked = () => { video.removeEventListener("seeked", onSeeked); res(); };
        video.addEventListener("seeked", onSeeked);
        try { video.currentTime = 0; } catch { video.removeEventListener("seeked", onSeeked); res(); }
      });

      let drawing = true;
      const loop = () => {
        if (!drawing) return;
        try {
          ctx.drawImage(video, 0, 0, W, H);
          const t = video.currentTime;
          const seg = segs.find((s) => t >= s.start_seconds && t <= s.end_seconds);
          if (seg) drawCaption(ctx, W, H, seg.text);
        } catch {}
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);

      try { await video.play(); }
      catch (e) { toast.error("Browser blocked playback. Click the preview once, then retry."); throw e; }

      const dur = isFinite(video.duration) ? video.duration : 600;
      await new Promise<void>((res) => {
        const startedAt = performance.now();
        const tick = () => {
          if (video.ended || video.currentTime >= dur - 0.05 || performance.now() - startedAt > (dur + 5) * 1000) {
            video.removeEventListener("timeupdate", tick);
            res();
          }
        };
        video.addEventListener("timeupdate", tick);
        const poll = setInterval(() => {
          if (video.ended || video.currentTime >= dur - 0.05 || performance.now() - startedAt > (dur + 5) * 1000) {
            clearInterval(poll); video.removeEventListener("timeupdate", tick); res();
          }
        }, 150);
      });

      drawing = false;
      try { video.pause(); } catch {}

      setProgress("Finalizing...");
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setStitchedUrl(url);
      onStitched?.(blob);
      toast.success("Short created! Preview and download below.");
    } catch (e) {
      console.error("Build short failed:", e);
      toast.error(e instanceof Error ? e.message : "Failed to build short");
    } finally {
      setBusy(false);
      setProgress("");
    }
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

      <div>
        <label className="text-sm font-medium mb-1 block">Title shown on the opening card</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title for your Short" />
      </div>

      <Button onClick={buildShort} disabled={busy} size="lg" className="w-full">
        {busy ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />{progress || "Working..."}</>)
              : (<><Sparkles className="mr-2 h-5 w-5" />Create YouTube Short (title + captions)</>)}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Adds a 2-second branded title card and burns in spoken captions throughout the clip. Please don't close this tab while it's working.
      </p>

      {stitchedUrl && (
        <Card className="p-4 mt-4 border-primary">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Play className="h-4 w-4" />Your YouTube Short</h3>
          <video src={stitchedUrl} controls className="w-full rounded-md border bg-black max-h-[500px]" />
          <a href={stitchedUrl} download="youtube-short.webm" className="inline-block mt-3">
            <Button variant="outline"><Download className="mr-2 h-4 w-4" />Download (.webm)</Button>
          </a>
        </Card>
      )}
    </div>
  );
}
