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
  initialBranding?: Record<string, string> | null;
  onBrandingChange?: (branding: Record<string, string>) => void;
}

// 9:16 portrait canvas (YouTube Shorts standard)
const OUT_W = 1080;
const OUT_H = 1920;
const TOP_BAND_H = 240;     // top banner height
const BOTTOM_BAND_H = 280;  // bottom banner (presenter only)
const CAPTION_AREA_H = 240; // white strip above bottom banner for captions
const TITLE_CARD_DURATION_MS = 2500;

export function ShortBuilder({ referenceFileId, videoUrl, defaultTitle, onStitched, initialStitchedUrl }: Props) {
  const [title, setTitle] = useState("SATSANG");
  const [shortName, setShortName] = useState(defaultTitle || "");
  const [subtitle, setSubtitle] = useState("A Unique Guided Meditation Practice");
  const [presenter, setPresenter] = useState("Ramashram Satsang Mathura");
  const [presenterNote, setPresenterNote] = useState("Founded in 1930 by Paramsant Dr. Chaturbhuj Sahay");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [segments, setSegments] = useState<CaptionSegment[] | null>(null);
  const [stitchedUrl, setStitchedUrl] = useState<string | null>(initialStitchedUrl || null);
  const [stitchedExt, setStitchedExt] = useState<"mp4" | "webm">("webm");
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => setStitchedUrl(initialStitchedUrl || null), [initialStitchedUrl]);
  useEffect(() => { if (defaultTitle) setShortName((prev) => prev || defaultTitle); }, [defaultTitle]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoUrl;
    img.onload = () => { logoImgRef.current = img; };
    img.onerror = () => {
      // fallback without CORS
      const img2 = new Image();
      img2.src = logoUrl;
      img2.onload = () => { logoImgRef.current = img2; };
    };
  }, []);

  // ---------- helpers ----------
  const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
    const words = (text || "").split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawBandBackground = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, "#b8dff0");
    g.addColorStop(0.5, "#d9ecf6");
    g.addColorStop(1, "#b8dff0");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };

  const drawTopBanner = (ctx: CanvasRenderingContext2D) => {
    drawBandBackground(ctx, 0, 0, OUT_W, TOP_BAND_H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // Title
    ctx.fillStyle = "#0b3b6f";
    ctx.font = `bold 96px Georgia, "Times New Roman", serif`;
    const titleText = (title || "").toUpperCase();
    ctx.fillText(titleText, OUT_W / 2, 110);
    // Subtitle
    if (subtitle) {
      ctx.fillStyle = "#0d2a4a";
      ctx.font = `42px Georgia, "Times New Roman", serif`;
      ctx.fillText(subtitle, OUT_W / 2, 180);
    }
    ctx.textAlign = "left";
  };

  const drawBottomBanner = (ctx: CanvasRenderingContext2D) => {
    const y0 = OUT_H - BOTTOM_BAND_H;
    drawBandBackground(ctx, 0, y0, OUT_W, BOTTOM_BAND_H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    if (presenter) {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = `36px Georgia, "Times New Roman", serif`;
      ctx.fillText("Presented By", OUT_W / 2, y0 + 70);
      ctx.fillStyle = "#0b3b6f";
      ctx.font = `bold 56px Georgia, "Times New Roman", serif`;
      ctx.fillText(presenter, OUT_W / 2, y0 + 140);
    }
    if (presenterNote) {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = `30px Georgia, "Times New Roman", serif`;
      ctx.fillText(presenterNote, OUT_W / 2, y0 + BOTTOM_BAND_H - 40);
    }
    ctx.textAlign = "left";
  };

  const drawCaption = (ctx: CanvasRenderingContext2D, captionText: string) => {
    // White strip just above the bottom banner
    const y0 = OUT_H - BOTTOM_BAND_H - CAPTION_AREA_H;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, y0, OUT_W, CAPTION_AREA_H);

    const cleanCaption = (captionText || "").replace(/\s+/g, " ").trim();
    if (!cleanCaption) return;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const capFont = 68;
    ctx.font = `bold ${capFont}px Georgia, "Times New Roman", serif`;
    const lines = wrapLines(ctx, cleanCaption, OUT_W * 0.92).slice(0, 3);
    ctx.fillStyle = "#0b3b6f";
    const lh = capFont * 1.2;
    const totalH = lines.length * lh;
    let y = y0 + (CAPTION_AREA_H - totalH) / 2 + capFont;
    for (const l of lines) { ctx.fillText(l, OUT_W / 2, y); y += lh; }
    ctx.textAlign = "left";
  };

  const drawVideoFrame = (ctx: CanvasRenderingContext2D, video: HTMLVideoElement) => {
    const midY = TOP_BAND_H;
    const midH = OUT_H - TOP_BAND_H - BOTTOM_BAND_H - CAPTION_AREA_H;
    // White background for middle area (fills any letterbox space)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, midY, OUT_W, midH);

    const vW = video.videoWidth || 1280;
    const vH = video.videoHeight || 720;
    const drawW = OUT_W;
    const drawH = vH * (OUT_W / vW);
    const dx = 0;
    const dy = midY + Math.max(0, (midH - drawH) / 2);
    try { ctx.drawImage(video, dx, dy, drawW, drawH); } catch {}
  };

  const drawTitleCard = (ctx: CanvasRenderingContext2D) => {
    // White full background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    drawTopBanner(ctx);
    drawBottomBanner(ctx);

    const midY = TOP_BAND_H;
    const midH = OUT_H - TOP_BAND_H - BOTTOM_BAND_H;
    const logo = logoImgRef.current;

    // Draw Srijan logo (upper portion of middle area)
    if (logo && logo.width > 0) {
      const maxW = OUT_W * 0.7;
      const maxH = midH * 0.55;
      const ratio = Math.min(maxW / logo.width, maxH / logo.height);
      const lw = logo.width * ratio;
      const lh = logo.height * ratio;
      const lx = (OUT_W - lw) / 2;
      const ly = midY + midH * 0.08;
      try { ctx.drawImage(logo, lx, ly, lw, lh); } catch {}
    }

    // Short name (lower portion of middle area, bold)
    const name = (shortName || title || "").trim();
    if (name) {
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const fontSize = 78;
      ctx.font = `bold ${fontSize}px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = "#0b3b6f";
      const lines = wrapLines(ctx, name, OUT_W * 0.88).slice(0, 3);
      const lh = fontSize * 1.2;
      const blockH = lines.length * lh;
      const areaTop = midY + midH * 0.68;
      const areaH = midH * 0.3;
      let y = areaTop + (areaH - blockH) / 2 + fontSize;
      for (const l of lines) { ctx.fillText(l, OUT_W / 2, y); y += lh; }
      ctx.textAlign = "left";
    }
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

      const canvas = document.createElement("canvas");
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d")!;

      drawTopBanner(ctx);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, TOP_BAND_H, OUT_W, OUT_H - TOP_BAND_H - BOTTOM_BAND_H);
      drawBottomBanner(ctx);

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

      const mimeCandidates = [
        "video/mp4;codecs=h264,aac",
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
      const isMp4 = mimeType.startsWith("video/mp4");
      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { recorder.onstop = () => res(); });

      recorder.start(250);

      try { video.pause(); } catch {}

      // Title card phase (1s)
      setProgress("Rendering title card...");
      drawTitleCard(ctx);
      await new Promise((res) => setTimeout(res, 1000));

      // Video phase
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
          drawTopBanner(ctx);
          drawVideoFrame(ctx, video);
          const t = video.currentTime;
          const seg = segs.find((s) => t >= s.start_seconds && t <= s.end_seconds);
          drawCaption(ctx, seg?.text || "");
          drawBottomBanner(ctx);
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
      setStitchedExt(isMp4 ? "mp4" : "webm");
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Title (top banner)</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SATSANG" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Short name (title card & file name)</label>
          <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Name of this YouTube Short" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Subtitle</label>
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="A Unique Guided Meditation Practice" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Presenter (bottom banner)</label>
          <Input value={presenter} onChange={(e) => setPresenter(e.target.value)} placeholder="Ramashram Satsang Mathura" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Presenter note</label>
          <Input value={presenterNote} onChange={(e) => setPresenterNote(e.target.value)} placeholder="Founded in 1930 by ..." />
        </div>
      </div>

      <Button onClick={buildShort} disabled={busy} size="lg" className="w-full">
        {busy ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />{progress || "Working..."}</>)
              : (<><Sparkles className="mr-2 h-5 w-5" />Create YouTube Short (9:16 with banners + captions)</>)}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Output is 1080x1920 (9:16) with a branded title card, top title banner, and bottom caption + presenter banner on every frame.
      </p>

      {stitchedUrl && (
        <Card className="p-4 mt-4 border-primary">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Play className="h-4 w-4" />Your YouTube Short (9:16)</h3>
          <div className="flex justify-center bg-black rounded-md">
            <video src={stitchedUrl} controls className="rounded-md max-h-[600px]" style={{ aspectRatio: "9/16" }} />
          </div>
          <a href={stitchedUrl} download={`${(shortName || "youtube-short").replace(/[^\w\-]+/g, "_")}.${stitchedExt}`} className="inline-block mt-3">
            <Button variant="outline"><Download className="mr-2 h-4 w-4" />Download (.{stitchedExt})</Button>
          </a>
        </Card>
      )}
    </div>
  );
}
