import Link from "next/link";
import { loadAnalysis } from "@/lib/server/load";
import { saveDealStructure, deleteDealStructure } from "@/lib/server/actions";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  HelpTip,
  Input,
  Label,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatCents, formatCentsShort, formatMultiple, formatPct } from "@/lib/money";
import type { DscrTierKey } from "@/lib/engine/dscr";
import { SBA_FLOOR, MARKET_THRESHOLD } from "@/lib/engine/dscr";

const TIER_LABELS: Record<DscrTierKey, string> = {
  all_addbacks: "Adjusted EBITDA (all add-backs)",
  documented_only: "Adjusted EBITDA (documented only)",
  sde: "Seller's discretionary earnings",
};

function centsToDollarsInput(cents: number): string {
  return cents ? (cents / 100).toFixed(0) : "";
}
function bpsToPctInput(bps: number): string {
  return bps ? (bps / 100).toFixed(2) : "";
}

export default async function DscrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { bridge, dscr } = analysis;
  const deal = bundle.dealStructure;

  if (bundle.facts.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState
          icon="🏛️"
          title="Lender terms need a P&L first"
          body="DSCR is Adjusted EBITDA divided by the proposed debt service. Upload the monthly P&L and build the EBITDA bridge before modeling deal terms."
        >
          <Link href={`/engagements/${id}/documents`} className="text-sm font-medium text-primary underline underline-offset-2">
            Go to Documents →
          </Link>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Optional: lender debt service coverage">
        This step is optional — sell-side reports don&apos;t always know the buyer&apos;s financing yet.
        Enter a proposed deal structure to see whether it clears SBA (
        {formatMultiple(SBA_FLOOR)} floor) and market ({formatMultiple(MARKET_THRESHOLD)}) DSCR
        thresholds at each conservatism tier of adjusted EBITDA.
      </Callout>

      <Card
        title="Proposed deal structure"
        subtitle="Purchase price and financing terms. Debt service is calculated on a standard amortization schedule (interest on the beginning balance each month)."
        actions={
          deal ? (
            <form action={deleteDealStructure}>
              <input type="hidden" name="engagement_id" value={id} />
              <Button type="submit" variant="ghost" size="sm">
                Clear
              </Button>
            </form>
          ) : undefined
        }
      >
        <form action={saveDealStructure} className="space-y-5">
          <input type="hidden" name="engagement_id" value={id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="purchase_price">Purchase price ($)</Label>
              <Input
                id="purchase_price"
                name="purchase_price"
                type="number"
                min={0}
                step={1000}
                defaultValue={deal ? centsToDollarsInput(deal.purchase_price_cents) : ""}
                placeholder="1,200,000"
              />
            </div>
            <div>
              <Label htmlFor="equity_injection">Equity injection ($)</Label>
              <Input
                id="equity_injection"
                name="equity_injection"
                type="number"
                min={0}
                step={1000}
                defaultValue={deal ? centsToDollarsInput(deal.equity_injection_cents) : ""}
                placeholder="120,000"
              />
            </div>
          </div>

          <fieldset className="rounded-lg border border-edge p-4">
            <legend className="px-1 text-xs font-semibold text-ink">Senior debt (e.g. SBA 7(a))</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="senior_debt">Amount ($)</Label>
                <Input id="senior_debt" name="senior_debt" type="number" min={0} step={1000} defaultValue={deal ? centsToDollarsInput(deal.senior_debt_cents) : ""} placeholder="900,000" />
              </div>
              <div>
                <Label htmlFor="senior_rate">Rate (% APR)</Label>
                <Input id="senior_rate" name="senior_rate" type="number" min={0} step={0.05} defaultValue={deal ? bpsToPctInput(deal.senior_rate_bps) : ""} placeholder="10.50" />
              </div>
              <div>
                <Label htmlFor="senior_term_months">Term (months)</Label>
                <Input id="senior_term_months" name="senior_term_months" type="number" min={0} step={1} defaultValue={deal?.senior_term_months || ""} placeholder="120" />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-edge p-4">
            <legend className="px-1 text-xs font-semibold text-ink">Seller note</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="seller_note">Amount ($)</Label>
                <Input id="seller_note" name="seller_note" type="number" min={0} step={1000} defaultValue={deal ? centsToDollarsInput(deal.seller_note_cents) : ""} placeholder="150,000" />
              </div>
              <div>
                <Label htmlFor="seller_note_rate">Rate (% APR)</Label>
                <Input id="seller_note_rate" name="seller_note_rate" type="number" min={0} step={0.05} defaultValue={deal ? bpsToPctInput(deal.seller_note_rate_bps) : ""} placeholder="6.00" />
              </div>
              <div>
                <Label htmlFor="seller_note_term_months">Term (months)</Label>
                <Input id="seller_note_term_months" name="seller_note_term_months" type="number" min={0} step={1} defaultValue={deal?.seller_note_term_months || ""} placeholder="60" />
              </div>
              <div>
                <Label htmlFor="seller_note_io_months">
                  <span className="inline-flex items-center gap-1">
                    IO period (months)
                    <HelpTip>Interest-only months before principal payments begin — common on seller notes.</HelpTip>
                  </span>
                </Label>
                <Input id="seller_note_io_months" name="seller_note_io_months" type="number" min={0} step={1} defaultValue={deal?.seller_note_io_months || ""} placeholder="12" />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-edge p-4">
            <legend className="px-1 text-xs font-semibold text-ink">Existing debt assumed</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="existing_debt">Amount ($)</Label>
                <Input id="existing_debt" name="existing_debt" type="number" min={0} step={1000} defaultValue={deal ? centsToDollarsInput(deal.existing_debt_cents) : ""} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="existing_debt_rate">Rate (% APR)</Label>
                <Input id="existing_debt_rate" name="existing_debt_rate" type="number" min={0} step={0.05} defaultValue={deal ? bpsToPctInput(deal.existing_debt_rate_bps) : ""} placeholder="7.00" />
              </div>
              <div>
                <Label htmlFor="existing_debt_term_months">Term (months)</Label>
                <Input id="existing_debt_term_months" name="existing_debt_term_months" type="number" min={0} step={1} defaultValue={deal?.existing_debt_term_months || ""} placeholder="0" />
              </div>
            </div>
          </fieldset>

          <Button type="submit" size="lg">
            {deal ? "Update deal structure" : "Save deal structure"}
          </Button>
        </form>
      </Card>

      {dscr && dscr.tranches.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {dscr.tiers.map((t) => (
              <StatTile
                key={t.tier}
                label={TIER_LABELS[t.tier]}
                value={formatMultiple(t.ratio)}
                sub={
                  t.meetsMarketThreshold
                    ? `Clears market threshold (${formatMultiple(MARKET_THRESHOLD)})`
                    : t.meetsSbaFloor
                      ? `Meets SBA floor, below market (${formatMultiple(SBA_FLOOR)}–${formatMultiple(MARKET_THRESHOLD)})`
                      : `Below SBA floor (${formatMultiple(SBA_FLOOR)})`
                }
                tone={t.meetsMarketThreshold ? "good" : "default"}
              />
            ))}
          </div>

          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                Debt service coverage ratio
                <HelpTip>
                  DSCR = Adjusted EBITDA (or SDE) ÷ total year-one debt service across all tranches.
                  SBA SOP 50 10 8 requires at least {formatMultiple(SBA_FLOOR)}; most lenders target{" "}
                  {formatMultiple(MARKET_THRESHOLD)} or higher.
                </HelpTip>
              </span>
            }
            subtitle={`Total year-one debt service: ${formatCentsShort(dscr.totalAnnualDebtServiceCents)}`}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Earnings basis</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Debt service</Th>
                  <Th align="right">DSCR</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {dscr.tiers.map((t) => (
                  <tr key={t.tier}>
                    <Td>{TIER_LABELS[t.tier]}</Td>
                    <Td align="right">{formatCents(t.earningsCents)}</Td>
                    <Td align="right">{formatCents(t.debtServiceCents)}</Td>
                    <Td align="right" className="font-semibold">
                      {formatMultiple(t.ratio)}
                    </Td>
                    <Td>
                      {t.meetsMarketThreshold ? (
                        <Badge tone="green" dot>
                          Clears market
                        </Badge>
                      ) : t.meetsSbaFloor ? (
                        <Badge tone="yellow" dot>
                          Meets SBA only
                        </Badge>
                      ) : (
                        <Badge tone="red" dot>
                          Below SBA floor
                        </Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Debt tranches" subtitle="Year-one scheduled principal & interest, per tranche.">
            <Table>
              <thead>
                <tr>
                  <Th>Tranche</Th>
                  <Th align="right">Principal</Th>
                  <Th align="right">Rate</Th>
                  <Th align="right">Term</Th>
                </tr>
              </thead>
              <tbody>
                {dscr.tranches.map((t) => (
                  <tr key={t.name}>
                    <Td>{t.name}</Td>
                    <Td align="right">{formatCentsShort(t.principalCents)}</Td>
                    <Td align="right">{formatPct(t.annualRateBps)}</Td>
                    <Td align="right">{t.termMonths} mo</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {bridge.adjustedEbitdaCents <= 0 && (
        <Callout tone="warn" title="Adjusted EBITDA is zero or negative">
          DSCR isn&apos;t meaningful until the EBITDA bridge reflects the business&apos;s earnings.
          Review the add-backs on the previous step.
        </Callout>
      )}
    </div>
  );
}
