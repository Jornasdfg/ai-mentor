import WerkgeverView from "@/components/werk/WerkgeverView";

export const dynamic = "force-dynamic";

// Korte, herkenbare werkgever-link: /u/<code>
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <WerkgeverView token={code} />;
}
