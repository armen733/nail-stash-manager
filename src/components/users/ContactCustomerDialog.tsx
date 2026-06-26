import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

const STORE_NAME = "Nera Beauty";
const STORE_EMAIL = "info@nerabeautyus.com";

type Channel = "email" | "sms";

interface TemplateDef {
  id: string;
  label: string;
  subject: string;
  body: (name: string) => string;
  smsBody?: (name: string) => string;
}

const TEMPLATES: TemplateDef[] = [
  {
    id: "miss_you",
    label: "We miss you",
    subject: `${STORE_NAME} misses you 💚`,
    body: (n) =>
      `Hi ${n || "there"},\n\nIt's been a while! We miss having you at ${STORE_NAME}. Stop by — we have new arrivals waiting for you, and a little something special for returning customers.\n\nSee you soon,\nThe ${STORE_NAME} Team`,
    smsBody: (n) =>
      `Hi ${n || "there"}, it's ${STORE_NAME} 💚 We miss you! New arrivals are in — come check them out.`,
  },
  {
    id: "new_arrivals",
    label: "New arrivals are in",
    subject: `New arrivals just dropped at ${STORE_NAME} ✨`,
    body: (n) =>
      `Hi ${n || "there"},\n\nFresh stock just landed at ${STORE_NAME} — new nail drill bits, accessories and exclusive picks we know you'll love.\n\nCome see what's new before they're gone.\n\nWith love,\n${STORE_NAME}`,
    smsBody: (n) =>
      `Hey ${n || "there"}! New arrivals just landed at ${STORE_NAME} ✨ Come check them out before they sell out.`,
  },
  {
    id: "order_ready",
    label: "Your order is ready",
    subject: `Your ${STORE_NAME} order is ready for pickup`,
    body: (n) =>
      `Hi ${n || "there"},\n\nGreat news — your order is ready for pickup at ${STORE_NAME}. We can't wait to see you!\n\nThanks,\n${STORE_NAME}`,
    smsBody: (n) =>
      `Hi ${n || "there"}, your ${STORE_NAME} order is ready for pickup. See you soon!`,
  },
  {
    id: "thanks",
    label: "Thank you",
    subject: `Thank you from ${STORE_NAME} 💚`,
    body: (n) =>
      `Hi ${n || "there"},\n\nJust a quick note to say thank you for shopping with ${STORE_NAME}. Your support means everything to us.\n\nWith gratitude,\nThe ${STORE_NAME} Team`,
    smsBody: (n) =>
      `Hi ${n || "there"}, thank you for choosing ${STORE_NAME} 💚 We appreciate you!`,
  },
  {
    id: "custom",
    label: "Custom message",
    subject: "",
    body: () => "",
    smsBody: () => "",
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: {
    id?: string;
    full_name: string;
    email: string;
    phone: string | null;
  } | null;
}

export function ContactCustomerDialog({ open, onOpenChange, customer }: Props) {
  const [channel, setChannel] = useState<Channel>("email");
  const [templateId, setTemplateId] = useState<string>("miss_you");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const firstName = useMemo(() => {
    return customer?.full_name?.split(" ")[0] || "";
  }, [customer]);

  const applyTemplate = (id: string, ch: Channel = channel) => {
    setTemplateId(id);
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    if (ch === "email") {
      setSubject(tpl.subject);
      setBody(tpl.body(firstName));
    } else {
      setSubject("");
      setBody((tpl.smsBody ?? tpl.body)(firstName));
    }
  };

  // initialize when opening / when customer changes
  useMemo(() => {
    if (open && customer) applyTemplate(templateId, channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);

  const handleChannelChange = (ch: Channel) => {
    setChannel(ch);
    applyTemplate(templateId, ch);
  };

  const isPlaceholderEmail = customer?.email?.endsWith("@placeholder.local");

  const handleSend = () => {
    if (!customer) return;

    if (channel === "email") {
      if (!customer.email || isPlaceholderEmail) {
        toast.error("This customer has no email on file");
        return;
      }
      const url = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`;
      window.location.href = url;
      toast.success("Opening your email app…", {
        description: `From ${STORE_EMAIL} → ${customer.email}`,
      });
    } else {
      if (!customer.phone) {
        toast.error("This customer has no phone number on file");
        return;
      }
      // sms: link — iOS uses &body=, Android uses ?body=. Use ?body= which works on both modern OSes.
      const phone = customer.phone.replace(/[^\d+]/g, "");
      const url = `sms:${phone}?&body=${encodeURIComponent(body)}`;
      window.location.href = url;
      toast.success("Opening Messages…", {
        description: `To ${customer.phone}`,
      });
    }
    onOpenChange(false);
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contact {customer.full_name}</DialogTitle>
          <DialogDescription>
            Pick a template, tweak it, and we'll open your{" "}
            {channel === "email" ? "mail app" : "Messages app"} pre-filled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Channel toggle */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={channel === "email" ? "default" : "outline"}
              onClick={() => handleChannelChange("email")}
              className="min-h-[44px]"
              disabled={!customer.email || isPlaceholderEmail}
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
            <Button
              type="button"
              variant={channel === "sms" ? "default" : "outline"}
              onClick={() => handleChannelChange("sms")}
              className="min-h-[44px]"
              disabled={!customer.phone}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Text Message
            </Button>
          </div>

          {channel === "email" && (!customer.email || isPlaceholderEmail) && (
            <p className="text-xs text-destructive">No email on file for this customer.</p>
          )}
          {channel === "sms" && !customer.phone && (
            <p className="text-xs text-destructive">No phone on file for this customer.</p>
          )}

          {/* Template picker */}
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={(v) => applyTemplate(v)}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* From / To info */}
          <div className="rounded-md bg-muted/40 border p-3 text-xs space-y-1">
            {channel === "email" ? (
              <>
                <p>
                  <span className="text-muted-foreground">From: </span>
                  <span className="font-medium">{STORE_EMAIL}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">To: </span>
                  <span className="font-medium">{customer.email}</span>
                </p>
              </>
            ) : (
              <p>
                <span className="text-muted-foreground">To: </span>
                <span className="font-medium">{customer.phone}</span>
              </p>
            )}
          </div>

          {/* Subject (email only) */}
          {channel === "email" && (
            <div className="space-y-2">
              <Label htmlFor="contact-subject">Subject</Label>
              <Input
                id="contact-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          )}

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="contact-body">
              {channel === "email" ? "Message" : "Text"}
            </Label>
            <Textarea
              id="contact-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={channel === "email" ? 10 : 5}
              className="resize-none"
            />
            {channel === "sms" && (
              <p className="text-[11px] text-muted-foreground">
                {body.length} chars · {Math.max(1, Math.ceil(body.length / 160))} SMS segment(s)
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              className="min-h-[44px]"
              disabled={
                (channel === "email" && (!customer.email || isPlaceholderEmail)) ||
                (channel === "sms" && !customer.phone) ||
                !body.trim()
              }
            >
              <Send className="h-4 w-4 mr-2" />
              Open {channel === "email" ? "Mail" : "Messages"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
