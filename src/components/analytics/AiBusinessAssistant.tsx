import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Send, ChevronDown, ChevronUp, Bot, User, FileDown, Trash2, Maximize2, Minimize2, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { NERA_PACKING_LOGO } from "@/lib/packingLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Msg {
  role: "user" | "assistant";
  content: string;
  /** Analysis period this message was asked/answered under */
  days?: number;
}

const SUGGESTIONS = [
  "What sold the most last month?",
  "Which salons buy the most, and what are their favorites?",
  "What's low on stock and needs restocking now?",
  "Which products should I discontinue?",
  "What do you recommend I focus on this month?",
];

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, k) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={k} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
    ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
      <em key={k} className="italic text-muted-foreground">{p.slice(1, -1)}</em>
    ) : p.startsWith("`") && p.endsWith("`") ? (
      <code key={k} className="font-mono text-xs px-1 rounded bg-muted">{p.slice(1, -1)}</code>
    ) : (
      <span key={k}>{p}</span>
    )
  );
}

const cells = (row: string) =>
  row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

// Render a light subset of markdown: bold, code, bullets and pipe tables
function renderBlocks(content: string) {
  const lines = content.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) block.push(lines[i++]);
      const rows = block.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map(cells);
      if (rows.length) {
        const [head, ...body] = rows;
        out.push(
          <div key={`t${i}`} className="overflow-x-auto rounded-md border my-1">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>{head.map((h, k) => <th key={k} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{inline(h)}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {body.map((r, k) => (
                  <tr key={k}>{r.map((c, n) => <td key={n} className="px-2 py-1.5 whitespace-nowrap">{inline(c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    const bulleted = /^\s*[-*]\s+/.test(line);
    const text = line.replace(/^\s*[-*]\s+/, "").replace(/^#+\s*/, "");
    if (!text.trim()) out.push(<div key={i} className="h-2" />);
    else
      out.push(
        <p key={i} className={bulleted ? "pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-primary" : ""}>
          {inline(text)}
        </p>
      );
    i++;
  }
  return out;
}


const stripMd = (t: string) =>
  t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/^#+\s*/, "");

// Export the whole conversation as a branded PDF
function exportConversationPdf(messages: Msg[], days: number) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  try {
    const props = doc.getImageProperties(NERA_PACKING_LOGO);
    const targetH = 16;
    doc.addImage(NERA_PACKING_LOGO, "PNG", margin, 10, (props.width / props.height) * targetH, targetH);
  } catch {}
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("AI Business Report", 46, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Analysis period: last ${days} days`, 46, 25);
  doc.setFontSize(9);
  doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy p")}`, pageWidth - margin, 18, { align: "right" });

  let y = 40;
  const pageHeight = doc.internal.pageSize.getHeight();
  const ensure = (h: number) => {
    if (y + h > pageHeight - 16) {
      doc.addPage();
      y = 20;
    }
  };

  messages.forEach((m) => {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(m.role === "user" ? 20 : 90);
    doc.text(m.role === "user" ? "Question" : "AI answer", margin, y);
    y += 5;
    doc.setTextColor(20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const lines = m.content.split("\n");
    let i = 0;
    while (i < lines.length) {
      if (/^\s*\|.*\|\s*$/.test(lines[i])) {
        const block: string[] = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) block.push(lines[i++]);
        const rows = block
          .filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r))
          .map((r) => cells(r).map(stripMd));
        if (rows.length) {
          const [head, ...body] = rows;
          autoTable(doc, {
            startY: y,
            head: [head],
            body,
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [40, 40, 40] },
            margin: { left: margin, right: margin },
          });
          y = (doc as any).lastAutoTable.finalY + 4;
        }
        continue;
      }
      const bulleted = /^\s*[-*]\s+/.test(lines[i]);
      const text = stripMd(lines[i].replace(/^\s*[-*]\s+/, ""));
      if (!text.trim()) {
        y += 3;
      } else {
        const indent = bulleted ? margin + 4 : margin;
        const wrapped = doc.splitTextToSize((bulleted ? "• " : "") + text, pageWidth - indent - margin);
        wrapped.forEach((w: string) => {
          ensure(6);
          doc.text(w, indent, y);
          y += 5;
        });
      }
      i++;
    }
    y += 5;
  });

  doc.save(`ai-business-report-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
}


export function AiBusinessAssistant() {
  const [open, setOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(90);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore the saved conversation for the signed-in user
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("ai_report_sessions")
        .select("messages, days, updated_at")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!active) return;
      if (data) {
        const saved = (data.messages as unknown as Msg[]) || [];
        if (saved.length) setMessages(saved);
        if (data.days) setDays(data.days);
        setSavedAt(data.updated_at as string);
      }
      setRestored(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Auto-save the conversation whenever it changes
  useEffect(() => {
    if (!restored || loading) return;
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !active) return;
      const { error } = await supabase
        .from("ai_report_sessions")
        .upsert(
          { user_id: auth.user.id, messages: messages as unknown as any, days },
          { onConflict: "user_id" }
        );
      if (error) {
        console.error("Could not save AI report conversation", error);
        return;
      }
      if (active) setSavedAt(new Date().toISOString());
    })();
    return () => {
      active = false;
    };
  }, [messages, days, restored, loading]);

  const clearConversation = async () => {
    setMessages([]);
    setSavedAt(null);
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      await supabase.from("ai_report_sessions").delete().eq("user_id", auth.user.id);
    }
    toast.success("Conversation cleared");
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Exit fullscreen with Escape, and keep textarea focused when entering fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    if (fullscreen) inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    // Only carry over the conversation from the same analysis period
    const history = messages
      .filter((m) => (m.days ?? days) === days)
      .map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q, days }]);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analytics-assistant", {
        body: { question: q, messages: history, days },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setMessages((m) => [...m, { role: "assistant", content: (data as any).answer, days }]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      toast.error(
        msg.includes("429")
          ? "Too many requests — try again in a moment."
          : msg.includes("402")
          ? "AI credits exhausted. Add credits in Settings → Plans & Credits."
          : "Could not get an answer: " + msg
      );
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I couldn't analyze that just now. Please try again.", days }]);
    } finally {
      setLoading(false);
    }
  };

  const card = (
    <Card
      className={
        fullscreen
          ? "fixed inset-0 z-[100] flex h-screen w-screen max-h-screen flex-col rounded-none border-0 bg-background shadow-none"
          : "shadow-[var(--shadow-card)] border-primary/30"
      }
    >

      <CardHeader className={fullscreen ? "pb-3 shrink-0" : "pb-3"}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Business Report & Assistant
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDays(next);
                if (messages.length) {
                  toast.info(`Switched to last ${next} days — earlier answers stay above, new questions use the new period.`);
                }
              }}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="Analysis period"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last year</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={messages.length === 0}
              title="Clear saved conversation"
              onClick={clearConversation}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={messages.length === 0}
              title="Print the latest answer"
              onClick={() => {
                try {
                  const lastAi = [...messages].reverse().findIndex((m) => m.role === "assistant");
                  const idx = lastAi === -1 ? messages.length - 1 : messages.length - 1 - lastAi;
                  exportConversationPdf(exchangeAt(messages, idx), messages[idx]?.days ?? days);
                  toast.success("Latest answer exported as PDF");
                } catch (e: any) {
                  toast.error("Could not export PDF: " + String(e?.message || e));
                }
              }}
            >
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={fullscreen ? "Exit fullscreen" : "Open fullscreen"}
              onClick={() => setFullscreen((f) => !f)}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (fullscreen) {
                  setFullscreen(false);
                } else {
                  setOpen((o) => !o);
                }
              }}
            >
              {fullscreen ? <X className="h-4 w-4" /> : open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className={fullscreen ? "flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden" : "space-y-3"}>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowSuggestions((s) => !s)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              {showSuggestions ? "Hide suggested questions" : "Show suggested questions"}
            </button>
          </div>
          {showSuggestions && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  onClick={() => ask(s)}
                  className="cursor-pointer hover:bg-primary/10 text-[11px] font-normal py-1"
                >
                  {s}
                </Badge>
              ))}
            </div>
          )}


          <div
            ref={scrollRef}
            className={
              fullscreen
                ? "flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-4 space-y-4 text-sm"
                : "max-h-[420px] min-h-[120px] overflow-y-auto rounded-lg border bg-muted/20 p-3 space-y-4 text-sm"
            }
          >
            {messages.length === 0 && !loading && (
              <p className="text-muted-foreground text-sm">
                Ask anything about sales, salons, products, stock or profit — I read your live data for the selected period.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className="flex gap-2">
                <div className={`mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center ${m.role === "user" ? "bg-muted" : "bg-primary/15"}`}>
                  {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1 leading-relaxed text-foreground/90">
                  {m.days != null && m.days !== days && (
                    <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      last {m.days} days
                    </span>
                  )}
                  {renderBlocks(m.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing your data…
              </div>
            )}
          </div>

          {savedAt && messages.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Conversation saved · last updated {format(new Date(savedAt), "MMM dd, yyyy p")}
            </p>
          )}

          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder="Ask about last month's sales, best salons, restocking…"
              className={fullscreen ? "min-h-[60px] max-h-40 resize-none text-sm" : "min-h-[44px] max-h-32 resize-none text-sm"}
            />
            <Button onClick={() => ask(input)} disabled={loading || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );

  return fullscreen ? createPortal(card, document.body) : card;
}

