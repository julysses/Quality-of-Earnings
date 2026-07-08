import { loadAnalysis } from "@/lib/server/load";
import { Badge, Callout, Card, Table, Td, Th } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { ClassifyTxnForm } from "@/components/classify-txn";
import { AckGateForm } from "@/components/ack-gate";
import { TXN_CLASS_LABELS } from "@/lib/types";

export default async function ProofOfCashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { poc, txns, classRows } = analysis;
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const accountName = new Map(bundle.accounts.map((a) => [a.id, a.name]));
  const acks = new Map(bundle.gateAcks.map((g) => [g.gate_key, g.note]));

  if (bundle.transactions.length === 0 || bundle.facts.length === 0) {
    return (
      <Callout tone="info" title="Not enough data yet">
        The proof of cash needs both bank activity and a monthly P&L. Upload them on the Documents
        tab.
      </Callout>
    );
  }

  return (
    <div className="space-y-4">
      <Callout tone="info" title="What this is">
        Month by month, we compare what the books say the business earned and spent against what
        actually moved through the bank accounts (with transfers between the seller&apos;s own
        accounts netted out automatically). Months that don&apos;t tie within tolerance are flagged —
        resolve each open item below in plain English, or acknowledge the variance with an
        explanation that will be disclosed in the report.
      </Callout>

      <Card title="Monthly proof of cash" subtitle="Variance = bank activity (adjusted) − books. Tolerance: greater of $2,500 or 0.5% of the month's revenue.">
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">Bank deposits</Th>
              <Th align="right">Non-revenue</Th>
              <Th align="right">Book revenue</Th>
              <Th align="right">Revenue variance</Th>
              <Th align="right">Bank spend</Th>
              <Th align="right">Book expenses</Th>
              <Th align="right">Expense variance</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {poc.months.map((m) => {
              const flagged = m.revenue.flagged || m.expense.flagged;
              return (
                <tr key={m.month} id={m.month}>
                  <Td className="font-medium">{m.month}</Td>
                  <Td align="right">{formatCents(m.revenue.bankTotalCents)}</Td>
                  <Td align="right">{formatCents(-m.revenue.excludedCents)}</Td>
                  <Td align="right">{formatCents(m.revenue.bookCents)}</Td>
                  <Td align="right" className={m.revenue.flagged ? "font-semibold text-red-600" : ""}>
                    {formatCents(m.revenue.varianceCents)}
                  </Td>
                  <Td align="right">{formatCents(m.expense.bankTotalCents - m.expense.excludedCents)}</Td>
                  <Td align="right">{formatCents(m.expense.bookCents)}</Td>
                  <Td align="right" className={m.expense.flagged ? "font-semibold text-red-600" : ""}>
                    {formatCents(m.expense.varianceCents)}
                  </Td>
                  <Td>
                    {flagged ? (
                      acks.has(`poc:${m.month}`) ? (
                        <Badge tone="yellow">acknowledged</Badge>
                      ) : (
                        <Badge tone="red">open</Badge>
                      )
                    ) : (
                      <Badge tone="green">ties</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {poc.months
        .filter((m) => m.revenue.flagged || m.expense.flagged)
        .map((m) => {
          const ackKey = `poc:${m.month}`;
          const openTxns = m.openItemTxnIds
            .map((tid) => txnById.get(tid))
            .filter((t) => t != null)
            .sort((a, b) => Math.abs(b!.amountCents) - Math.abs(a!.amountCents))
            .slice(0, 25);
          return (
            <Card
              key={m.month}
              title={`Resolve ${m.month}`}
              subtitle={`Revenue variance ${formatCents(m.revenue.varianceCents)} · Expense variance ${formatCents(m.expense.varianceCents)}. Classify the items below — the schedule recomputes instantly.`}
            >
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Account</Th>
                    <Th>Description</Th>
                    <Th align="right">Amount</Th>
                    <Th>What is this?</Th>
                  </tr>
                </thead>
                <tbody>
                  {openTxns.map((t) => (
                    <tr key={t!.id}>
                      <Td>{t!.date}</Td>
                      <Td className="max-w-36 truncate text-xs">{accountName.get(t!.accountId) ?? "—"}</Td>
                      <Td className="max-w-56 truncate">{t!.description}</Td>
                      <Td align="right">{formatCents(t!.amountCents)}</Td>
                      <Td>
                        <ClassifyTxnForm engagementId={id} transactionId={t!.id} isDeposit={t!.amountCents > 0} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <details className="mt-3 text-xs text-slate-500">
                <summary className="cursor-pointer">
                  Already excluded this month ({m.revenue.excludedTxnIds.length + m.expense.excludedTxnIds.length}{" "}
                  transactions — transfers, draws, classified items)
                </summary>
                <ul className="mt-1 list-disc pl-5">
                  {[...m.revenue.excludedTxnIds, ...m.expense.excludedTxnIds].map((tid) => {
                    const t = txnById.get(tid);
                    const c = classRows.get(tid);
                    if (!t) return null;
                    return (
                      <li key={tid}>
                        {t.date} · {t.description} · {formatCents(t.amountCents)} —{" "}
                        {c ? TXN_CLASS_LABELS[c.class] : ""} {c?.source === "auto" ? "(auto)" : ""}
                      </li>
                    );
                  })}
                </ul>
              </details>

              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                {acks.has(ackKey) ? (
                  <Callout tone="warn" title="Variance acknowledged (will be disclosed in the report)">
                    {acks.get(ackKey)}
                  </Callout>
                ) : (
                  <AckGateForm
                    engagementId={id}
                    gateKey={ackKey}
                    label="Can't fully resolve this month? Acknowledge the remaining variance with an explanation — it becomes a disclosed exception in the report."
                  />
                )}
              </div>
            </Card>
          );
        })}
    </div>
  );
}
