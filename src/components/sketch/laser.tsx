"use client";

import { useEffect, useRef } from "react";

/** How long a point of the trail stays visible, in milliseconds. */
const TRAIL_MS = 700;
const MAX_POINTS = 400;

type Trail = { x: number; y: number; t: number };

/**
 * The laser pointer's trail: a glowing dot that follows the pointer and leaves a line that fades out. It's
 * drawn on its own canvas in screen pixels and never touches the sketch, so nothing is saved, undone or exported.
 */
export class LaserTrail {
  private points: Trail[] = [];
  private down = false;
  private canvas: HTMLCanvasElement | null = null;
  private frame = 0;
  private color = "red";

  attach(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    if (!canvas) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  /** Adds a point, in pixels from the canvas's top-left corner. */
  add(x: number, y: number) {
    this.down = true;
    this.points.push({ x, y, t: performance.now() });
    if (this.points.length > MAX_POINTS) this.points.splice(0, this.points.length - MAX_POINTS);
    this.run();
  }

  /** The button was released: the dot and the line fade out together. */
  release() {
    this.down = false;
    this.run();
  }

  private run() {
    if (this.frame || !this.canvas) return;
    // Read at the start of each burst so a theme switch shows up.
    this.color = getComputedStyle(this.canvas).getPropertyValue("--pen-red").trim() || "red";
    this.frame = requestAnimationFrame(this.draw);
  }

  private draw = (now: number) => {
    this.frame = 0;
    const canvas = this.canvas;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);

    // While the button is down, the head stays bright even when the pointer rests.
    const head = this.points[this.points.length - 1];
    if (this.down && head) head.t = now;
    this.points = this.points.filter((p) => now - p.t < TRAIL_MS);
    if (!this.points.length) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const life = 1 - (now - b.t) / TRAIL_MS;
      ctx.globalAlpha = Math.max(0, life);
      ctx.lineWidth = 2 + 4 * life;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const last = this.points[this.points.length - 1];
    const life = 1 - (now - last.t) / TRAIL_MS;
    ctx.globalAlpha = Math.max(0, life);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3 + 4 * life, 0, Math.PI * 2);
    ctx.fill();

    this.frame = requestAnimationFrame(this.draw);
  };
}

/** The canvas the trail is drawn on, covering the sketch and letting every pointer event through. */
export function LaserLayer({ trail }: { trail: LaserTrail }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };
    fit();
    trail.attach(canvas);
    const resize = new ResizeObserver(fit);
    resize.observe(canvas);
    return () => {
      resize.disconnect();
      trail.attach(null);
    };
  }, [trail]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-30 size-full" />;
}
