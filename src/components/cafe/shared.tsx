import { ChevronDown, Copy, Download, FileJson, FileText, Pencil, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { ExportFile } from "@/lib/cafe/export";
import { MAX_SCOPE, MAX_TOPIC } from "@/lib/cafe/logic";
import { useCafe } from "@/lib/cafe/room-store";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Builds the export lazily on click, so it always reflects the latest live state. */
export function ExportMenu({ build }: { build: () => ExportFile }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            const f = build();
            download(`${f.filename}.md`, f.markdown, "text/markdown");
          }}
        >
          <FileText /> Download Markdown
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const f = build();
            download(`${f.filename}.json`, JSON.stringify(f.json, null, 2), "application/json");
          }}
        >
          <FileJson /> Download JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard
              .writeText(build().markdown)
              .then(() => toast.success("Markdown copied"))
              .catch(() => toast.error("Couldn't access the clipboard"));
          }}
        >
          <Copy /> Copy Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HowToPlay({ lines }: { lines: string[] }) {
  return (
    <ol className="list-inside list-decimal space-y-0.5 rounded-lg border border-dashed bg-card/60 px-4 py-2 text-sm text-muted-foreground">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ol>
  );
}

export function ConfirmButton({
  label,
  title,
  description,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <RotateCcw /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Yes, reset</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The room's scope & goal; the host can edit topic and scope, everyone sees changes live. */
export function OntologyPanel() {
  const cafe = useCafe();
  const { room, isHost } = cafe;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ topic: string; scope: string } | null>(null);
  if (!room.scope && !isHost) return null;

  const save = () => {
    if (!draft) return;
    const patch = { topic: draft.topic.trim(), scope: draft.scope.trim() };
    cafe.setRoom({ ...room, ...patch });
    setDraft(null);
    void cafe
      .write(supabase.from("rooms").update(patch).eq("id", room.id))
      .then((ok) => ok && cafe.log("updated the topic and scope"));
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-left font-medium">
        {room.scope ? "Scope & goal" : "Add a topic and scope & goal (host)"}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-4 pb-3 text-sm leading-relaxed">
        {draft ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Input
              aria-label="Ontology topic"
              placeholder="Ontology topic, e.g. Animals"
              value={draft.topic}
              maxLength={MAX_TOPIC}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            />
            <Textarea
              aria-label="Scope & goal"
              placeholder="What is in and out of scope, and what should the ontology help with?"
              rows={5}
              value={draft.scope}
              maxLength={MAX_SCOPE}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            {room.scope && <p className="whitespace-pre-wrap">{room.scope}</p>}
            {isHost && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDraft({ topic: room.topic, scope: room.scope })}
              >
                <Pencil /> Edit topic and scope
              </Button>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-semibold">{children}</h2>
      <div className="flex flex-wrap items-center gap-1">{actions}</div>
    </div>
  );
}
