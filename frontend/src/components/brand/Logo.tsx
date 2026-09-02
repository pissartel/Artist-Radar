"use client";
import { useId } from "react";
export default function Logo({ size = 26, wordmark = true }: { size?: number; wordmark?: boolean }) {
  const gradientId = `nextstage-${useId().replace(/:/g, "")}`;
  return <span className="inline-flex items-center gap-2.5 font-extrabold tracking-[-0.02em] text-foreground"><svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className="shrink-0"><defs><linearGradient id={gradientId} x1="14" y1="14" x2="56" y2="46" gradientUnits="userSpaceOnUse"><stop stopColor="#6D6BFF"/><stop offset=".5" stopColor="#A855F7"/><stop offset="1" stopColor="#FB5B76"/></linearGradient></defs><path d="M14 58 V10 Q 32 32 46 58 V16" stroke={`url(#${gradientId})`} strokeWidth="9" strokeLinejoin="round" strokeLinecap="round"/><path d="M46 4.5 L38 15 H54 Z" fill={`url(#${gradientId})`} stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinejoin="round"/></svg>{wordmark && <span style={{fontSize:size >= 30 ? 17 : 15}}>NextStage</span>}</span>;
}
