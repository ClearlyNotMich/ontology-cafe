import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ontology Café" },
      { name: "description", content: "Card sorting & 20 questions for our coffee ontology" },
      { property: "og:title", content: "Ontology Café" },
      {
        property: "og:description",
        content: "Card sorting & 20 questions for our coffee ontology",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-tight text-foreground">Ontology Café</h1>
      <p className="text-lg text-muted-foreground">
        Card sorting &amp; 20 questions for our coffee ontology
      </p>
    </main>
  );
}
