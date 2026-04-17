/**
 * AiResponseRenderer — shared structured renderer for LLM prose responses.
 *
 * Parses numbered sections (1) ... 2) ...) from Claude's output and renders
 * each as a distinct visual block with accent border, badge, and label.
 * Handles inline markdown: **bold**, `code`, and bullet lists.
 *
 * Used by: FindingDetailPanel, IRActionEngine, VoiceIRAgent (LLMTriageCard).
 */

import React from "react";

export const AI_SECTION_COLORS = ["#818cf8", "#34d399", "#fb923c", "#facc15"] as const;

export const TRIAGE_LABELS: Record<number, string> = {
  1: "Assessment",
  2: "Confidence",
  3: "MITRE ATT&CK",
  4: "Recommended Actions",
};

export const ROOT_CAUSE_LABELS: Record<number, string> = {
  1: "Root Cause",
  2: "Attack Chain",
  3: "MITRE Mapping",
  4: "Contributing Factors",
};

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseAiSections(
  text: string
): Array<{ num: number; heading: string | null; body: string }> {
  const starts: Array<{ num: number; start: number; textStart: number }> = [];
  const re = /(?:^|\n)[ \t]*(\d+)[).:][ \t]*/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    starts.push({
      num: parseInt(m[1], 10),
      start: m.index === 0 ? 0 : m.index,
      textStart: m.index + m[0].length,
    });
  }
  if (starts.length < 2) return [];
  return starts.map((s, i) => {
    const raw = text.slice(s.textStart, starts[i + 1]?.start ?? text.length).trim();
    const boldHeading = raw.match(/^\*\*([^*]+)\*\*[:\s]*/);
    const colonHeading = !boldHeading && raw.match(/^([A-Za-z][^:\n]{3,40}):\s*/);
    const heading = boldHeading ? boldHeading[1] : colonHeading ? colonHeading[1] : null;
    const body = boldHeading
      ? raw.slice(boldHeading[0].length).trim()
      : colonHeading
      ? raw.slice(colonHeading[0].length).trim()
      : raw;
    return { num: s.num, heading, body };
  });
}

// ─── Inline markdown ──────────────────────────────────────────────────────────

export function renderInlineMd(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={m.index} style={{ color: "#f1f5f9", fontWeight: 700 }}>
          {m[2]}
        </strong>
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={m.index}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.9em",
            background: "rgba(129,140,248,0.12)",
            border: "1px solid rgba(129,140,248,0.2)",
            borderRadius: 3,
            padding: "1px 5px",
            color: "#a5b4fc",
          }}
        >
          {m[3]}
        </code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ─── Body renderer ────────────────────────────────────────────────────────────

function renderAiBody(body: string, accent: string, compact: boolean): React.ReactNode {
  const fontSize = compact ? 10.5 : 12;
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let bulletGroup: string[] = [];

  const flushBullets = (key: string) => {
    if (bulletGroup.length === 0) return;
    elements.push(
      <ul key={`ul-${key}`} style={{ margin: "3px 0 0 0", padding: 0, listStyle: "none" }}>
        {bulletGroup.map((b, bi) => (
          <li
            key={bi}
            style={{
              display: "flex",
              gap: 6,
              marginBottom: compact ? 2 : 3,
              fontSize,
              lineHeight: 1.55,
              color: "rgba(203,213,225,0.85)",
            }}
          >
            <span
              style={{
                color: accent,
                flexShrink: 0,
                marginTop: 1,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: compact ? 9 : 10,
              }}
            >
              ›
            </span>
            <span>{renderInlineMd(b)}</span>
          </li>
        ))}
      </ul>
    );
    bulletGroup = [];
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets(String(i));
      return;
    }
    if (/^[-•*]\s+/.test(trimmed)) {
      bulletGroup.push(trimmed.replace(/^[-•*]\s+/, ""));
    } else {
      flushBullets(String(i));
      elements.push(
        <p
          key={i}
          style={{
            margin: "0 0 3px 0",
            fontSize,
            lineHeight: compact ? 1.55 : 1.65,
            color: "rgba(203,213,225,0.85)",
          }}
        >
          {renderInlineMd(trimmed)}
        </p>
      );
    }
  });
  flushBullets("end");
  return <>{elements}</>;
}

// ─── Section block ────────────────────────────────────────────────────────────

function AiSectionBlock({
  num,
  heading,
  body,
  fallbackLabel,
  accent,
  compact,
}: {
  num: number;
  heading: string | null;
  body: string;
  fallbackLabel: string;
  accent: string;
  compact: boolean;
}) {
  const label = heading ?? fallbackLabel;
  return (
    <div
      style={{
        borderLeft: `2px solid ${accent}40`,
        paddingLeft: compact ? 8 : 10,
        paddingTop: 1,
        paddingBottom: 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: compact ? 3 : 5 }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: compact ? 8 : 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: accent,
            background: `${accent}18`,
            border: `1px solid ${accent}30`,
            borderRadius: 3,
            padding: compact ? "0 4px" : "1px 5px",
            lineHeight: 1.5,
            flexShrink: 0,
          }}
        >
          {String(num).padStart(2, "0")}
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: compact ? 8.5 : 10,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase" as const,
            color: `${accent}cc`,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ paddingLeft: 2 }}>{renderAiBody(body, accent, compact)}</div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function AiAnalysisText({
  text,
  sectionLabels,
  baseColor = "#818cf8",
  compact = false,
}: {
  text: string;
  sectionLabels: Record<number, string>;
  baseColor?: string;
  compact?: boolean;
}) {
  const sections = parseAiSections(text);

  if (sections.length === 0) {
    return (
      <p
        style={{
          fontSize: compact ? 10.5 : 12,
          color: "rgba(203,213,225,0.8)",
          lineHeight: compact ? 1.55 : 1.7,
          margin: 0,
        }}
      >
        {renderInlineMd(text)}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 7 : 10 }}>
      {sections.map((s) => (
        <AiSectionBlock
          key={s.num}
          num={s.num}
          heading={s.heading}
          body={s.body}
          fallbackLabel={sectionLabels[s.num] ?? `Section ${s.num}`}
          accent={AI_SECTION_COLORS[(s.num - 1) % AI_SECTION_COLORS.length]}
          compact={compact}
        />
      ))}
    </div>
  );
}
