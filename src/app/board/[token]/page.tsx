import { WhiteboardClient } from "@/components/whiteboard-client";

type BoardPageProps = {
  params: Promise<{
    token: string;
  }>;
};

type BoardStaticParams = {
  readonly token: string;
};

export async function generateStaticParams(): Promise<BoardStaticParams[]> {
  if (process.env.NEXT_OUTPUT_EXPORT === "true") {
    return [{ token: "github-pages-placeholder" }];
  }

  return [];
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { token } = await params;
  return <WhiteboardClient token={token} />;
}
