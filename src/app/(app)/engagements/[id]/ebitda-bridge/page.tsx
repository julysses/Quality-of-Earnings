import { loadAnalysis } from "@/lib/server/load";
import { Badge, Card, EmptyState, HelpTip, StatTile, Table, Td, Th } from "@/components/ui";
import { formatCents, formatCentsShort } from "@/lib/money";
import { Waterfall, type WaterfallItem } from "@/components/waterfall";
import { AddAdjustmentForm } from "@/components/add-adjustment";
import { DeleteAdjustmentButton } from "@/components/delete-adjustment";
import { ADJUSTMENT_CATEGORY_LABELS, type Scrutiny } from "@/lib/types";
import Link from "next/link";

const SCRUTINY_TONE: Record<Scrutiny, "green" | "yellow" | "red"> = {
  documented: "green",
  partially_supported: "yellow",
  unsupported: "red",
};
const SCRUTINY_LABEL: Record<Scrutiny, string> = {
  documented: "Documented",
  partially_supported: "Partially supported",
  unsupported: "Unsupported",
};

export default async function BridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { bridge } = analysis;

  if (bundle.facts.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState
          icon="📈"
          title="The EBITDA bridge needs a P&L first"
          body="Upload the monthly P&L on the Documents step — then adjust reported EBITDA for owner and one-time items here."
        >
          <Link
            href={`/engagements/${id}/documents`}
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            Go to Documents →
          </Link>
        </EmptyState>
      </Card>
    );
  }

  const evidenceCount = new Map<string, number>();
  for (const e of bundle.evidence) {
    evidenceCount.set(e.adjustment_id, (evidenceCount.get(e.adjustment_id) ?? 0) + 1);
  }

  const candidateTxns = analysis.txns
    .filter((t) => t.amountCents < 0)
    .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))
    .slice(0, 400)
    .map((t) => ({
      id: t.id,
      label: `${t.date} · ${t.description} · ${formatCents(t.amountCents)}`,
      description: t.description,
    }));

  const waterfallItems: WaterfallItem[] = [
    { label: "Reported EBITDA", amountCents: bridge.ebitdaCents, kind: "total" },
    ...bridge.adjustments.map((a) => ({
      label: a.name,
      amountCents: a.amountCents,
      kind: "delta" as const,
    })),
    { label: "Adjusted EBITDA", amountCents: bridge.adjustedEbitdaCents, kind: "total" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Adjusted EBITDA"
          value={formatCentsShort(bridge.adjustedEbitdaCents)}
          sub="All add-backs — the seller's case"
          tone="primary"
        />
        <StatTile
          label="Documented only"
          value={formatCentsShort(bridge.adjustedEbitdaDocumentedCents)}
          sub="How a conservative lender reads it"
        />
        <StatTile
          label="SDE"
          value={formatCentsShort(bridge.sdeCents)}
          sub={`EBITDA + owner comp (${formatCentsShort(bridge.ownerCompCents)})`}
        />
      </div>

      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            The bridge
            <HelpTip>
              The bridge walks from reported EBITDA to adjusted EBITDA, one adjustment at a time.
              Buyers price the deal off the right-hand bar — which is why every step in between
              needs evidence.
            </HelpTip>
          </span>
        }
        subtitle="Reported EBITDA → each adjustment → adjusted EBITDA."
      >
        {bridge.adjustments.length > 0 ? (
          <Waterfall items={waterfallItems} />
        ) : (
          <div className="py-4">
            <Waterfall items={waterfallItems} />
            <p className="mt-3 text-center text-xs text-muted">
              No adjustments yet — reported and adjusted EBITDA are the same. Add the first
              adjustment below.
            </p>
          </div>
        )}
      </Card>

      <Card title="EBITDA build" subtitle="From reported net income, per the books.">
        <Table>
          <tbody>
            {(
              [
                ["Reported net income", bridge.netIncomeCents, false],
                ["+ Depreciation & amortization", bridge.daCents, false],
                ["+ Interest expense", bridge.interestCents, false],
                ["+ Income taxes", bridge.taxesCents, false],
                ["Reported EBITDA", bridge.ebitdaCents, true],
              ] as Array<[string, number, boolean]>
            ).map(([label, cents, bold], i) => (
              <tr key={i}>
                <Td className={bold ? "font-semibold" : ""}>{label}</Td>
                <Td align="right" className={bold ? "font-semibold" : ""}>
                  {formatCents(cents)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card
        title={`Adjustments (${bridge.adjustments.length})`}
        subtitle="Every adjustment needs evidence — a source document or the underlying bank transactions — plus a written rationale. The scrutiny badge shows how a lender will treat it."
      >
        {bridge.adjustments.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Adjustment</Th>
                <Th>Category</Th>
                <Th align="right">Amount</Th>
                <Th>Evidence</Th>
                <Th>Lender scrutiny</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {bridge.adjustments.map((a) => {
                const row = bundle.adjustments.find((x) => x.id === a.id);
                return (
                  <tr key={a.id}>
                    <Td>
                      <span className="font-semibold">{a.name}</span>
                      {row && <p className="max-w-72 text-xs leading-relaxed text-muted">{row.rationale}</p>}
                    </Td>
                    <Td>{ADJUSTMENT_CATEGORY_LABELS[a.category]}</Td>
                    <Td align="right" className="font-medium">
                      {formatCents(a.amountCents)}
                    </Td>
                    <Td>
                      <Badge tone="gray">{evidenceCount.get(a.id) ?? 0} linked</Badge>
                    </Td>
                    <Td>
                      <Badge tone={SCRUTINY_TONE[a.scrutiny]} dot>
                        {SCRUTINY_LABEL[a.scrutiny]}
                      </Badge>
                    </Td>
                    <Td>
                      <DeleteAdjustmentButton engagementId={id} adjustmentId={a.id} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className={bridge.adjustments.length > 0 ? "mt-5 border-t border-edge pt-5" : ""}>
          <AddAdjustmentForm
            engagementId={id}
            documents={bundle.documents.map((d) => ({ id: d.id, label: d.file_name }))}
            transactions={candidateTxns}
          />
        </div>
      </Card>
    </div>
  );
}
