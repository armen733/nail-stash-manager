import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Send, ChevronDown, ChevronUp, Bot, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What sold the most last month?",
  "Which salons buy the most, and what are their favorites?",
  "What's low on stock and needs restocking now?",
  "Which products should I discontinue?",
  "What do you recommend I focus on this month?",
];

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, k) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={k} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
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


export function AiBusinessAssistant() {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(90);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analytics-assistant", {
        body: { question: q, messages: history, days },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setMessages((m) => [...m, { role: "assistant", content: (data as any).answer }]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      toast.error(
        msg.includes("429")
          ? "Too many requests — try again in a moment."
          : msg.includes("402")
          ? "AI credits exhausted. Add credits in Settings → Plans & Credits."
          : "Could not get an answer: " + msg
      );
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I couldn't analyze that just now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-[var(--shadow-card)] border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Business Report & Assistant
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="Analysis period"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last year</option>
            </select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
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

          <div
            ref={scrollRef}
            className="max-h-[420px] min-h-[120px] overflow-y-auto rounded-lg border bg-muted/20 p-3 space-y-4 text-sm"
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

          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder="Ask about last month's sales, best salons, restocking…"
              className="min-h-[44px] max-h-32 resize-none text-sm"
            />
            <Button onClick={() => ask(input)} disabled={loading || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
