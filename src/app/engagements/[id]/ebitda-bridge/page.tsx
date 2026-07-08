import { loadAnalysis } from "@/lib/server/load";
import { Badge, Callout, Card, Table, Td, Th } from "@/components/ui";
import { formatCents, formatCentsShort } from "@/lib/money";
import { AddAdjustmentForm } from "@/components/add-adjustment";
import { DeleteAdjustmentButton } from "@/components/delete-adjustment";
import { ADJUSTMENT_CATEGORY_LABELS, type Scrutiny } from "@/lib/types";

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
      <Callout tone="info" title="Not enough data yet">
        The EBITDA bridge needs a monthly P&amp;L. Upload one on the Documents tab.
      </Callout>
    );
  }

  const evidenceCount = new Map<string, number>();
  for (const e of bundle.evidence) {
    evidenceCount.set(e.adjustment_id, (evidenceCount.get(e.adjustment_id) ?? 0) + 1);
  }

  // Candidate evidence for the form: disbursements, largest first.
  const candidateTxns = analysis.txns
    .filter((t) => t.amountCents < 0)
    .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))
    .slice(0, 400)
    .map((t) => ({
      id: t.id,
      label: `${t.date} · ${t.description} · ${formatCents(t.amountCents)}`,
      description: t.description,
    }));

  const bridgeRows: Array<[string, number, boolean]> = [
    ["Reported net income", bridge.netIncomeCents, false],
    ["+ Depreciation & amortization", bridge.daCents, false],
    ["+ Interest expense", bridge.interestCents, false],
    ["+ Income taxes", bridge.taxesCents, false],
    ["Reported EBITDA", bridge.ebitdaCents, true],
    ...bridge.adjustments.map(
      (a) => [`+ ${a.name}`, a.amountCents, false] as [string, number, boolean],
    ),
    ["Adjusted EBITDA", bridge.adjustedEbitdaCents, true],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Adjusted EBITDA (all add-backs)">
          <p className="text-2xl font-bold tabular-nums">{formatCentsShort(bridge.adjustedEbitdaCents)}</p>
          <p className="mt-1 text-xs text-slate-500">What the seller is asking the buyer to underwrite.</p>
        </Card>
        <Card title="Documented add-backs only">
          <p className="text-2xl font-bold tabular-nums">{formatCentsShort(bridge.adjustedEbitdaDocumentedCents)}</p>
          <p className="mt-1 text-xs text-slate-500">
            How a conservative lender will read it — undocumented add-backs get rejected.
          </p>
        </Card>
        <Card title="Seller's discretionary earnings">
          <p className="text-2xl font-bold tabular-nums">{formatCentsShort(bridge.sdeCents)}</p>
          <p className="mt-1 text-xs text-slate-500">
            EBITDA + one owner&apos;s full compensation ({formatCentsShort(bridge.ownerCompCents)}) — the
            standard Main-Street metric.
          </p>
        </Card>
      </div>

      <Card title="EBITDA bridge">
        <Table>
          <tbody>
            {bridgeRows.map(([label, cents, bold], i) => (
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
        subtitle="Every adjustment requires evidence — a source document or the underlying bank transactions — plus a written rationale. That's what makes the bridge defensible."
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
                      <span className="font-medium">{a.name}</span>
                      {row && <p className="max-w-72 text-xs text-slate-500">{row.rationale}</p>}
                    </Td>
                    <Td>{ADJUSTMENT_CATEGORY_LABELS[a.category]}</Td>
                    <Td align="right">{formatCents(a.amountCents)}</Td>
                    <Td>{evidenceCount.get(a.id) ?? 0} item(s)</Td>
                    <Td>
                      <Badge tone={SCRUTINY_TONE[a.scrutiny]}>{SCRUTINY_LABEL[a.scrutiny]}</Badge>
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
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
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
