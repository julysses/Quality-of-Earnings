import Link from "next/link";
import { loadAnalysis } from "@/lib/server/load";
import { Badge, Callout, Card, EmptyState, HelpTip, StatTile, Table, Td, Th } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { ClassifyTxnForm } from "@/components/classify-txn";
import { AckGateForm } from "@/components/ack-gate";
import { TXN_CLASS_LABELS } from "@/lib/types";

// Inline variance bar: magnitude of the monthly variance vs. the largest
// variance in the period. Thin mark, rounded end, status color when flagged.
function VarianceBar({
  valueCents,
  maxCents,
  flagged,
}: {
  valueCents: number;
  maxCents: number;
  flagged: boolean;
}) {
  const pct = maxCents > 0 ? Math.max((Math.abs(valueCents) / maxCents) * 100, valueCents === 0 ? 0 : 3) : 0;
  return (
    <div className="mt-1 h-1 w-full max-w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div
        className={`h-full rounded-full ${flagged ? "bg-bad" : "bg-edge-strong"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default async function ProofOfCashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { poc, txns, classRows } = analysis;
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const accountName = new Map(bundle.accounts.map((a) => [a.id, a.name]));
  const acks = new Map(bundle.gateAcks.map((g) => [g.gate_key, g.note]));

  if (bundle.transactions.length === 0 || bundle.facts.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState
          icon="🏦"
          title="The proof of cash needs data first"
          body="Upload bank statements and a monthly P&L on the Documents step — this page then reconciles the two, month by month."
        >
          <Link href={`/engagements/${id}/documents`} className="text-sm font-medium text-primary underline underline-offset-2">
            Go to Documents →
          </Link>
        </EmptyState>
      </Card>
    );
  }

  const tied = poc.months.length - poc.flaggedMonths.length;
  const acknowledged = poc.flaggedMonths.filter((m) => acks.has(`poc:${m}`)).length;
  const open = poc.flaggedMonths.length - acknowledged;
  const maxVariance = Math.max(
    1,
    ...poc.months.map((m) => Math.max(Math.abs(m.revenue.varianceCents), Math.abs(m.expense.varianceCents))),
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Months that tie" value={`${tied} / ${poc.months.length}`} sub="Within tolerance" tone={open === 0 ? "good" : "default"} />
        <StatTile label="Open items" value={open} sub={open > 0 ? "Resolve below" : "Nothing to resolve"} />
        <StatTile label="Disclosed exceptions" value={acknowledged} sub="Acknowledged variances" />
      </div>

      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            Monthly proof of cash
            <HelpTip>
              For each month we compare the books to the bank. <strong>Revenue side:</strong> bank
              deposits (minus transfers, owner contributions, and other non-revenue money-in)
              should equal book revenue. <strong>Expense side:</strong> bank spending (minus
              transfers, draws, and loan principal) should equal book cash expenses. The tolerance
              is the greater of $2,500 or 0.5% of the month&apos;s revenue.
            </HelpTip>
          </span>
        }
        subtitle="Variance = bank activity (adjusted) − books. Red months don't tie yet."
      >
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">Bank deposits (adj.)</Th>
              <Th align="right">Book revenue</Th>
              <Th align="right">Revenue variance</Th>
              <Th align="right">Bank spend (adj.)</Th>
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
                  <Td className="font-semibold">{m.month}</Td>
                  <Td align="right">{formatCents(m.revenue.adjustedBankCents)}</Td>
                  <Td align="right">{formatCents(m.revenue.bookCents)}</Td>
                  <Td align="right" className={m.revenue.flagged ? "font-semibold text-bad" : "text-muted"}>
                    {formatCents(m.revenue.varianceCents)}
                    <VarianceBar
                      valueCents={m.revenue.varianceCents}
                      maxCents={maxVariance}
                      flagged={m.revenue.flagged}
                    />
                  </Td>
                  <Td align="right">{formatCents(m.expense.adjustedBankCents)}</Td>
                  <Td align="right">{formatCents(m.expense.bookCents)}</Td>
                  <Td align="right" className={m.expense.flagged ? "font-semibold text-bad" : "text-muted"}>
                    {formatCents(m.expense.varianceCents)}
                    <VarianceBar
                      valueCents={m.expense.varianceCents}
                      maxCents={maxVariance}
                      flagged={m.expense.flagged}
                    />
                  </Td>
                  <Td>
                    {flagged ? (
                      acks.has(`poc:${m.month}`) ? (
                        <Badge tone="yellow" dot>
                          disclosed
                        </Badge>
                      ) : (
                        <Badge tone="red" dot>
                          open
                        </Badge>
                      )
                    ) : (
                      <Badge tone="green" dot>
                        ties
                      </Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {poc.flaggedMonths.length === 0 && (
        <Card padded={false}>
          <EmptyState
            icon="✅"
            title="The proof of cash ties"
            body="Every month reconciles to the bank within tolerance. This is the page lenders check first — and yours is clean."
          >
            <Link href={`/engagements/${id}/ebitda-bridge`} className="text-sm font-medium text-primary underline underline-offset-2">
              Continue to add-backs →
            </Link>
          </EmptyState>
        </Card>
      )}

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
              subtitle={`Revenue variance ${formatCents(m.revenue.varianceCents)} · expense variance ${formatCents(m.expense.varianceCents)}. Tell us what each item below actually is — the schedule recomputes instantly.`}
            >
              <div className="space-y-4">
                {openTxns.map((t) => (
                  <div
                    key={t!.id}
                    className="rounded-xl border border-edge bg-surface-2/50 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{t!.description}</p>
                        <p className="text-xs text-muted">
                          {t!.date} · {accountName.get(t!.accountId) ?? "bank account"}
                        </p>
                      </div>
                      <p className="text-lg font-bold tabular-nums text-ink">
                        {formatCents(t!.amountCents)}
                      </p>
                    </div>
                    <ClassifyTxnForm
                      engagementId={id}
                      transactionId={t!.id}
                      isDeposit={t!.amountCents > 0}
                    />
                  </div>
                ))}
              </div>

              <details className="mt-4 text-xs text-muted">
                <summary className="cursor-pointer font-medium hover:text-ink">
                  Already excluded this month (
                  {m.revenue.excludedTxnIds.length + m.expense.excludedTxnIds.length} transactions —
                  transfers, draws, classified items)
                </summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {[...m.revenue.excludedTxnIds, ...m.expense.excludedTxnIds].map((tid) => {
                    const t = txnById.get(tid);
                    const c = classRows.get(tid);
                    if (!t) return null;
                    return (
                      <li key={tid}>
                        {t.date} · {t.description} · {formatCents(t.amountCents)} —{" "}
                        {c ? TXN_CLASS_LABELS[c.class] : ""} {c?.source === "auto" ? "(automatic)" : ""}
                      </li>
                    );
                  })}
                </ul>
              </details>

              <div className="mt-5 border-t border-edge pt-4">
                {acks.has(ackKey) ? (
                  <Callout tone="warn" title="Variance acknowledged — will be disclosed in the report">
                    {acks.get(ackKey)}
                  </Callout>
                ) : (
                  <AckGateForm
                    engagementId={id}
                    gateKey={ackKey}
                    label="Can't fully resolve this month? Acknowledge the remaining variance with an explanation — it becomes a disclosed exception in the report instead of a silent gap."
                  />
                )}
              </div>
            </Card>
          );
        })}
    </div>
  );
}
