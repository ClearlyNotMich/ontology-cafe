import { createFileRoute } from "@tanstack/react-router";

import { RoomView } from "@/components/cafe/RoomView";

export const Route = createFileRoute("/room/$code")({
  // Room state lives in localStorage and Supabase realtime: render it in the browser only.
  ssr: false,
  head: ({ params }) => ({ meta: [{ title: `Room ${params.code} · Ontology Café` }] }),
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  return <RoomView code={code} />;
}
