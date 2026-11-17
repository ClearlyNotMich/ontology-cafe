import { Check, Coffee, HelpCircle, Plus, Search, Trophy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { addCards } from "@/lib/cafe/cards";
import { fireConfetti } from "@/lib/cafe/confetti";
import { buildTqExport } from "@/lib/cafe/export";
import { uuid } from "@/lib/cafe/identity";
import {
  ANSWER_LABELS,
  STUMP_POINTS,
  TOTAL_BEANS,
  TQ_NOTE_PREFIX,
  beansLeft,
  computeScores,
  isRoundOver,
  matchesConcept,
  mergeTree,
  nextBarista,
  roundPath,
  suggestTag,
  termFromQuestion,
  uniqueTerms,
  type TreeNode,
} from "@/lib/cafe/logic";
import { useCafe } from "@/lib/cafe/room-store";
import type { Answer, Question, Round, Tag } from "@/lib/cafe/types";
import { ConfirmButton, ExportMenu, HowToPlay, SectionTitle } from "./shared";

const ANSWERS: { value: Answer; label: string; className: string }[] = [
  { value: "yes", label: "Yes", className: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { value: "no", label: "No", className: "bg-rose-600 hover:bg-rose-700 text-white" },
  {
    value: "sometimes",
    label: "Sometimes",
    className: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  {
    value: "out_of_scope",
    label: "Out of scope",
    className: "bg-stone-500 hover:bg-stone-600 text-white",
  },
];
const ANSWER_CHIP: Record<string, string> = {
  yes: "bg-emerald-100 text-emerald-800",
  no: "bg-rose-100 text-rose-800",
  sometimes: "bg-amber-100 text-amber-900",
  out_of_scope: "bg-stone-200 text-stone-700",
};
const byCreated = (a: { created_at: string }, b: { created_at: string }) =>
  a.created_at.localeCompare(b.created_at);

export function TwentyQuestions() {
  const cafe = useCafe();
  const { tq_rounds, tq_questions, players, room, isHost, online } = cafe;
  const rounds = [...tq_rounds].sort((a, b) => a.number - b.number || byCreated(a, b));
  const current = rounds.at(-1);
  const [termFor, setTermFor] = useState<string | null>(null);

  // Confetti for everyone watching when the live round ends.
  const seen = useRef<{ id?: string; status?: string }>({});
  useEffect(() => {
    if (!current) return;
    const prev = seen.current;
    if (prev.id === current.id && prev.status !== current.status && isRoundOver(current)) {
      fireConfetti();
    }
    seen.current = { id: current.id, status: current.status };
  }, [current]);

  const startRound = (baristaId: string) => {
    const round: Round = {
      id: uuid(),
      room_id: room.id,
      number: (current?.number ?? 0) + 1,
      barista_id: baristaId,
      concept: null,
      status: "picking",
      winner_id: null,
      created_at: new Date().toISOString(),
      ended_at: null,
    };
    cafe.upsertLocal("tq_rounds", round);
    void cafe
      .write(supabase.from("tq_rounds").insert(round))
      .then(
        (ok) =>
          ok &&
          cafe.log(`started round ${round.number}; ${cafe.playerName(baristaId)} is the Barista`),
      );
  };

  const resetGame = async () => {
    cafe.removeLocal(
      "tq_rounds",
      tq_rounds.map((r) => r.id),
    );
    cafe.removeLocal(
      "tq_questions",
      tq_questions.map((q) => q.id),
    );
    await cafe.write(supabase.from("tq_rounds").delete().eq("room_id", room.id));
    cafe.log("restarted 20 Questions");
  };

  const activePlayers = players.filter((p) => online.has(p.id));
  const upNext = nextBarista(
    activePlayers.length ? activePlayers : players,
    current?.barista_id ?? null,
  );
  const canStart = !current || isRoundOver(current);

  return (
    <section className="space-y-4">
      <SectionTitle
        actions={
          <>
            <ExportMenu
              build={() =>
                buildTqExport({
                  roomCode: room.code,
                  exportedAt: new Date().toISOString(),
                  players,
                  rounds: tq_rounds,
                  questions: tq_questions,
                  cards: cafe.cards,
                })
              }
            />
            {isHost && (
              <ConfirmButton
                label="Restart"
                title="Restart 20 Questions?"
                description="All rounds, questions and scores are deleted for everyone."
                onConfirm={() => void resetGame()}
              />
            )}
          </>
        }
      >
        Café Detective (20 Questions)
      </SectionTitle>
      <HowToPlay
        lines={[
          "The Barista secretly picks a concept; detectives ask yes/no questions.",
          "Each answer costs a bean, so does a wrong guess. Guess early for more points.",
          "The order of questions is the point: it reveals our taxonomy (see the tree below).",
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4 rounded-xl border bg-card p-4">
          {current && <RoundPanel round={current} onMakeTerm={setTermFor} />}
          {canStart && (
            <div className="flex flex-wrap items-center gap-2">
              {upNext && (
                <Button size="lg" className="h-12 text-base" onClick={() => startRound(upNext.id)}>
                  <Coffee /> Start round {(current?.number ?? 0) + 1} (Barista: {upNext.name})
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="h-12 text-base"
                onClick={() => startRound(cafe.me.id)}
              >
                I'll be the Barista
              </Button>
            </div>
          )}
        </div>
        <Leaderboard />
      </div>
      <Taxonomy rounds={rounds} onMakeTerm={setTermFor} />
      {termFor && <TermDialog question={termFor} onClose={() => setTermFor(null)} />}
    </section>
  );
}

function RoundPanel({ round, onMakeTerm }: { round: Round; onMakeTerm: (q: string) => void }) {
  const cafe = useCafe();
  const { me, tq_questions, online } = cafe;
  const questions = tq_questions.filter((q) => q.round_id === round.id).sort(byCreated);
  const beans = beansLeft(questions);
  const isBarista = round.barista_id === me.id;
  const barista = cafe.playerName(round.barista_id);

  const endRound = (status: "guessed" | "stumped", winnerId: string | null = null) => {
    const patch = { status, winner_id: winnerId, ended_at: new Date().toISOString() };
    cafe.upsertLocal("tq_rounds", { ...round, ...patch });
    // Only the first ending counts; a racing guess or answer can't overwrite it.
    void cafe
      .write(supabase.from("tq_rounds").update(patch).eq("id", round.id).eq("status", "playing"))
      .then(
        (ok) =>
          ok &&
          cafe.log(
            status === "guessed"
              ? `guessed it: '${round.concept}'`
              : `stumped everyone with '${round.concept}'`,
          ),
      );
  };

  const insertQuestion = async (text: string, kind: "question" | "guess") => {
    const correct = kind === "guess" ? matchesConcept(text, round.concept ?? "") : null;
    const q: Question = {
      id: uuid(),
      room_id: round.room_id,
      round_id: round.id,
      asker_id: me.id,
      kind,
      text: text.trim().slice(0, 200),
      answer: null,
      correct,
      tag: kind === "question" ? suggestTag(text) : null,
      created_at: new Date().toISOString(),
    };
    cafe.upsertLocal("tq_questions", q);
    if (!(await cafe.write(supabase.from("tq_questions").insert(q)))) return;
    if (correct) endRound("guessed", me.id);
    else if (kind === "guess" && beansLeft([...questions, q]) === 0) endRound("stumped");
  };

  const answer = async (q: Question, value: Answer) => {
    cafe.upsertLocal("tq_questions", { ...q, answer: value });
    if (!(await cafe.write(supabase.from("tq_questions").update({ answer: value }).eq("id", q.id))))
      return;
    const after = questions.map((x) => (x.id === q.id ? { ...x, answer: value } : x));
    if (beansLeft(after) === 0) endRound("stumped");
  };

  const accept = async (q: Question) => {
    cafe.upsertLocal("tq_questions", { ...q, correct: true });
    if (await cafe.write(supabase.from("tq_questions").update({ correct: true }).eq("id", q.id)))
      endRound("guessed", q.asker_id);
  };

  if (round.status === "picking") {
    if (isBarista) return <PickConcept round={round} />;
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-lg">
          ☕ <strong>{barista}</strong> is picking a secret concept for round {round.number}…
        </p>
        {round.barista_id && !online.has(round.barista_id) && (
          <Button
            variant="outline"
            onClick={() => {
              cafe.upsertLocal("tq_rounds", { ...round, barista_id: me.id });
              void cafe.write(
                supabase.from("tq_rounds").update({ barista_id: me.id }).eq("id", round.id),
              );
            }}
          >
            {barista} left. Take over as Barista
          </Button>
        )}
      </div>
    );
  }

  const over = isRoundOver(round);
  const pending = questions.find((q) => q.kind === "question" && q.answer === null);
  const winner = round.winner_id ? cafe.playerName(round.winner_id) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Round {round.number} · Barista: <strong>{barista}</strong>
          </p>
          {over ? (
            <p className="text-2xl font-semibold" data-testid="reveal">
              It was <span className="text-primary">{round.concept}</span>!
            </p>
          ) : isBarista ? (
            <p className="text-lg">
              Your secret: <strong className="text-primary">{round.concept}</strong>
            </p>
          ) : (
            <p className="text-lg">Ask yes/no questions to find the secret concept.</p>
          )}
          {over && (
            <p className="text-muted-foreground">
              {round.status === "guessed"
                ? `${winner} guessed it with ${beans} bean${beans === 1 ? "" : "s"} left (+${Math.max(1, beans)}).`
                : `Nobody guessed it. ${barista} scores ${STUMP_POINTS}.`}
            </p>
          )}
        </div>
        <BeanCup left={beans} />
      </div>

      {!over && isBarista && pending && (
        <div className="space-y-3 rounded-xl bg-accent/50 p-4">
          <p className="text-sm text-muted-foreground">{cafe.playerName(pending.asker_id)} asks:</p>
          <p className="text-xl font-semibold">{pending.text}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ANSWERS.map((a) => (
              <Button
                key={a.value}
                className={`h-14 text-lg ${a.className}`}
                onClick={() => void answer(pending, a.value)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {!over && isBarista && !pending && (
        <p className="text-muted-foreground italic">Waiting for the detectives' next question…</p>
      )}
      {!over && !isBarista && <DetectiveInputs onSubmit={insertQuestion} />}

      <ol className="space-y-1.5" aria-label="Questions this round">
        {questions.map((q, i) => (
          <li
            key={q.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-3 py-2"
          >
            <span className="w-6 text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
            {q.kind === "guess" ? (
              <>
                <Search className="size-4 text-muted-foreground" />
                <span className="flex-1">
                  {cafe.playerName(q.asker_id)} guessed <strong>“{q.text}”</strong>
                </span>
                {q.correct ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800">
                    <Check className="inline size-4" /> correct
                  </span>
                ) : (
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-sm text-rose-800">
                    <X className="inline size-4" /> wrong
                  </span>
                )}
                {!over && isBarista && !q.correct && (
                  <Button size="sm" variant="outline" onClick={() => void accept(q)}>
                    Accept as correct
                  </Button>
                )}
              </>
            ) : (
              <>
                <span className="flex-1">{q.text}</span>
                <span className="text-xs text-muted-foreground">{cafe.playerName(q.asker_id)}</span>
                <span
                  className={`rounded px-2 py-0.5 text-sm ${q.answer ? ANSWER_CHIP[q.answer] : "bg-muted italic"}`}
                >
                  {q.answer ? ANSWER_LABELS[q.answer] : "waiting…"}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>

      {over && (
        <div className="space-y-2">
          <h3 className="font-semibold">This round's path</h3>
          <PathView round={round} onMakeTerm={onMakeTerm} />
        </div>
      )}
    </div>
  );
}

function DetectiveInputs({
  onSubmit,
}: {
  onSubmit: (text: string, kind: "question" | "guess") => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [guess, setGuess] = useState("");
  return (
    <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!question.trim()) return;
          void onSubmit(
            question.trim().endsWith("?") ? question : `${question.trim()}?`,
            "question",
          );
          setQuestion("");
        }}
      >
        <Input
          aria-label="Your question"
          placeholder="Is it an animal?"
          value={question}
          maxLength={199}
          onChange={(e) => setQuestion(e.target.value)}
          className="h-11 text-base"
        />
        <Button type="submit" className="h-11">
          <HelpCircle /> Ask
        </Button>
      </form>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!guess.trim()) return;
          void onSubmit(guess, "guess");
          setGuess("");
        }}
      >
        <Input
          aria-label="Your guess"
          placeholder="Guess: shark"
          value={guess}
          maxLength={120}
          onChange={(e) => setGuess(e.target.value)}
          className="h-11 text-base"
        />
        <Button type="submit" variant="secondary" className="h-11">
          <Search /> Guess
        </Button>
      </form>
    </div>
  );
}

function PickConcept({ round }: { round: Round }) {
  const cafe = useCafe();
  const [concept, setConcept] = useState("");
  // During the private writing phase only your own cards are fair game.
  const terms =
    cafe.room.cs_phase === "sort"
      ? uniqueTerms(cafe.cards, cafe.piles)
      : uniqueTerms(
          cafe.cards.filter((c) => c.author_id === cafe.me.id),
          [],
        );
  const filtered = terms
    .filter((t) => t.toLowerCase().includes(concept.trim().toLowerCase()))
    .slice(0, 40);
  const serve = () => {
    const c = concept.trim().slice(0, 120);
    if (!c) return;
    cafe.upsertLocal("tq_rounds", { ...round, concept: c, status: "playing" });
    void cafe
      .write(
        supabase.from("tq_rounds").update({ concept: c, status: "playing" }).eq("id", round.id),
      )
      .then((ok) => ok && cafe.log(`picked a secret concept for round ${round.number}`));
  };
  return (
    <div className="space-y-3">
      <p className="text-lg">
        You're the <strong>Barista</strong> for round {round.number}. Pick a secret concept:
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          serve();
        }}
      >
        <Input
          autoFocus
          aria-label="Secret concept"
          placeholder="Type one, or pick from our terms below"
          value={concept}
          maxLength={120}
          onChange={(e) => setConcept(e.target.value)}
          className="h-12 text-lg"
        />
        <Button type="submit" className="h-12 text-base" disabled={!concept.trim()}>
          <Coffee /> Serve it
        </Button>
      </form>
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => setConcept(t)}>
              {t}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function BeanCup({ left }: { left: number }) {
  return (
    <div
      className="flex items-end gap-2"
      aria-label={`${left} of ${TOTAL_BEANS} beans left`}
      data-testid="beans"
    >
      <div className="relative grid w-28 grid-cols-5 gap-0.5 rounded-b-[2rem] border-4 border-t-0 border-primary/70 bg-secondary/60 p-2 pt-3">
        {Array.from({ length: TOTAL_BEANS }, (_, i) => (
          <span
            key={i}
            className={`h-3 w-2.5 rounded-[50%] transition-all duration-500 ${i < left ? "bg-[#6f4e37] shadow-[inset_-1px_0_0_#3b2a1f]" : "scale-50 bg-transparent"}`}
          />
        ))}
        <span className="absolute top-2 -right-4 h-6 w-4 rounded-r-full border-4 border-l-0 border-primary/70" />
      </div>
      <span className="text-sm font-medium tabular-nums">{left} left</span>
    </div>
  );
}

function Leaderboard() {
  const { tq_rounds, tq_questions, players, playerName } = useCafe();
  const scores = computeScores(tq_rounds, tq_questions);
  const rows = [
    ...scores,
    ...players
      .filter((p) => !scores.some((s) => s.playerId === p.id))
      .map((p) => ({ playerId: p.id, points: 0 })),
  ];
  return (
    <aside className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Trophy className="size-4 text-amber-600" /> Leaderboard
      </h3>
      <ol className="space-y-1" aria-label="Leaderboard">
        {rows.map((r, i) => (
          <li key={r.playerId} className="flex justify-between">
            <span>
              {i + 1}. {playerName(r.playerId)}
            </span>
            <strong className="tabular-nums">{r.points}</strong>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Correct guess: 1 point per bean left. Stump everyone: Barista gets {STUMP_POINTS}.
      </p>
    </aside>
  );
}

function PathView({ round, onMakeTerm }: { round: Round; onMakeTerm: (q: string) => void }) {
  const { tq_questions } = useCafe();
  const path = roundPath(round, tq_questions);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="path">
      {path.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5">
          <button
            className="rounded-md border bg-background px-2 py-1 hover:bg-accent"
            title="Make this a term"
            onClick={() => onMakeTerm(s.question)}
          >
            {s.question}{" "}
            <span className={`rounded px-1 ${ANSWER_CHIP[s.answer]}`}>
              {ANSWER_LABELS[s.answer]}
            </span>
          </button>
          →
        </span>
      ))}
      <strong className="rounded-md bg-primary px-2 py-1 text-primary-foreground">
        {round.concept}
      </strong>
    </div>
  );
}

function Taxonomy({ rounds, onMakeTerm }: { rounds: Round[]; onMakeTerm: (q: string) => void }) {
  const cafe = useCafe();
  const finished = rounds.filter(isRoundOver);
  const tree = mergeTree(finished, cafe.tq_questions);
  const setTag = (ids: string[], tag: Tag | null) => {
    ids.forEach((id) => {
      const q = cafe.tq_questions.find((x) => x.id === id);
      if (q) cafe.upsertLocal("tq_questions", { ...q, tag });
    });
    void cafe.write(supabase.from("tq_questions").update({ tag }).in("id", ids));
  };
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <h3 className="text-lg font-semibold">🌳 Taxonomy from our questions</h3>
      {!finished.length ? (
        <p className="text-sm text-muted-foreground">Finish a round to grow the decision tree.</p>
      ) : (
        <>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">
              Question paths per round
            </h4>
            {finished.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">#{r.number}</span>
                <PathView round={r} onMakeTerm={onMakeTerm} />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-muted-foreground">
              Merged decision tree (tag questions, click a question to make it a term)
            </h4>
            <ul data-testid="tree">
              {tree.concepts.map((c) => (
                <li key={c} className="font-semibold">
                  {c}
                </li>
              ))}
              {tree.children.map((n) => (
                <TreeItem key={n.key} node={n} setTag={setTag} onMakeTerm={onMakeTerm} />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function TreeItem({
  node,
  setTag,
  onMakeTerm,
}: {
  node: TreeNode;
  setTag: (ids: string[], tag: Tag | null) => void;
  onMakeTerm: (q: string) => void;
}) {
  return (
    <li className="mt-1 border-l-2 border-primary/30 pl-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          className="text-left font-medium hover:underline"
          title="Make this a term"
          onClick={() => onMakeTerm(node.question)}
        >
          {node.question}
        </button>
        <span className={`rounded px-1.5 text-sm ${ANSWER_CHIP[node.answer]}`}>
          {ANSWER_LABELS[node.answer]}
        </span>
        {(["class", "property"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTag(node.questionIds, node.tag === t ? null : t)}
            className={`rounded-full border px-2 text-xs ${node.tag === t ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {t}
          </button>
        ))}
        <button
          aria-label={`Make "${node.question}" a term`}
          onClick={() => onMakeTerm(node.question)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <ul className="ml-1">
        {node.concepts.map((c) => (
          <li key={c} className="mt-1 pl-3 font-semibold text-primary">
            ☕ {c}
          </li>
        ))}
        {node.children.map((n) => (
          <TreeItem key={n.key} node={n} setTag={setTag} onMakeTerm={onMakeTerm} />
        ))}
      </ul>
    </li>
  );
}

function TermDialog({ question, onClose }: { question: string; onClose: () => void }) {
  const cafe = useCafe();
  const [term, setTerm] = useState(termFromQuestion(question));
  const save = () => {
    if (!term.trim()) return;
    void addCards(cafe, [term], { note: `${TQ_NOTE_PREFIX} ${question}`.slice(0, 500) }).then(
      (ok) => ok && cafe.log(`turned "${question}" into the term '${term.trim()}'`),
    );
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New term from a question</DialogTitle>
          <DialogDescription>“{question}” becomes a card in Card sorting.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            aria-label="Term"
            autoFocus
            value={term}
            maxLength={120}
            onChange={(e) => setTerm(e.target.value)}
          />
        </form>
        <DialogFooter>
          <Button onClick={save} disabled={!term.trim()}>
            Add term
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
