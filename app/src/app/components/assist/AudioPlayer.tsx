"use client";

import { useEffect, useRef, useState } from "react";

const SPEEDS = [0.75, 1, 1.25, 1.5];

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, label }: { src: string | null; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    const onTime = () => setTime(node.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(node.duration) ? node.duration : 0);
    const onEnd = () => setPlaying(false);
    node.addEventListener("timeupdate", onTime);
    node.addEventListener("loadedmetadata", onMeta);
    node.addEventListener("durationchange", onMeta);
    node.addEventListener("ended", onEnd);
    return () => {
      node.removeEventListener("timeupdate", onTime);
      node.removeEventListener("loadedmetadata", onMeta);
      node.removeEventListener("durationchange", onMeta);
      node.removeEventListener("ended", onEnd);
    };
  }, [src]);

  if (!src) return null;

  function toggle() {
    const node = audioRef.current;
    if (!node) return;
    if (node.paused) {
      void node.play();
      setPlaying(true);
      return;
    }
    node.pause();
    setPlaying(false);
  }

  return (
    <div className="listen-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="listen-controls">
        <button type="button" onClick={toggle} aria-label={playing ? `Pause ${label}` : `Play ${label}`}>
          {playing ? "Pause" : "Play"}
        </button>
        <label>
          Position
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(time, duration || 0)}
            aria-label={`${label} position`}
            onChange={(event) => {
              const node = audioRef.current;
              const next = Number(event.target.value);
              if (!node) return;
              node.currentTime = next;
              setTime(next);
            }}
          />
        </label>
        <span>
          {clock(time)} / {clock(duration)}
        </span>
        <label>
          Speed
          <select
            value={speed}
            aria-label={`${label} speed`}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSpeed(next);
              if (audioRef.current) audioRef.current.playbackRate = next;
            }}
          >
            {SPEEDS.map((item) => (
              <option key={item} value={item}>
                {item}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
