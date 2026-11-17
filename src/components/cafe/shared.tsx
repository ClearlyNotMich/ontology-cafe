import { ChevronDown, Copy, Download, FileJson, FileText, RotateCcw } from "lucide-react";
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
import type { ExportFile } from "@/lib/cafe/export";

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

export function OntologyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-left font-medium">
        ☕ Our ontology: scope and goal
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-4 pb-3 text-sm leading-relaxed">
        <p>
          <strong>Scope:</strong> a knowledge base for coffee enthusiasts and home baristas. It
          recommends coffees, brewing methods and drinks from a user's flavour, roast level or
          dietary needs (e.g. vegan). It covers manual brewing methods (pour-over, French press,
          AeroPress, espresso), the drinks made with them (latte, cappuccino, ...), their
          ingredients, roast levels, flavour profiles, origin regions and processing methods
          (washed, natural). Focus: specialty coffee. Out of scope: pads and capsules (Senseo,
          Nespresso), farming and harvesting, coffee chains and franchises.
        </p>
        <p>
          <strong>Goal:</strong> help users choose a coffee, roast level and brewing method that
          match their flavour and dietary preferences, explain what goes into each drink, and infer
          unstated properties (e.g. which drinks are vegan, which coffees likely taste fruity given
          origin, processing and roast).
        </p>
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

/** A few seconds of canvas confetti in coffee colours; no dependency needed. */
export function fireConfetti() {
  const canvas = document.createElement("canvas");
  canvas.className = "pointer-events-none fixed inset-0 z-[100]";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  const colors = ["#6f4e37", "#c8a27a", "#e6c9a8", "#b45309", "#f5e6d3", "#be123c", "#047857"];
  const bits = Array.from({ length: 160 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 200,
    y: canvas.height / 3,
    vx: (Math.random() - 0.5) * 16,
    vy: Math.random() * -14 - 4,
    r: Math.random() * Math.PI,
    color: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  const start = performance.now();
  const frame = (now: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.vy += 0.35;
      b.x += b.vx;
      b.y += b.vy;
      b.r += 0.2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.color;
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }
    if (now - start < 3000) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
