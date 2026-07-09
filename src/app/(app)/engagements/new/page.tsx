import Link from "next/link";
import { createEngagement } from "@/lib/server/actions";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";

const CHECKLIST: Array<[string, string]> = [
  ["Bank statements", "Every business account, every month of the period — CSV or OFX/QFX exports from online banking."],
  ["Monthly P&L", "A CSV with line items as rows and months as columns (any bookkeeping export works)."],
  ["Tax returns", "Filed returns for the years in the period — stored as evidence, reconciliation coming soon."],
  ["Agings & payroll", "AR/AP agings and payroll registers strengthen the report (optional)."],
];

export default function NewEngagement() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="text-xs font-medium text-muted hover:text-ink">
        ← All engagements
      </Link>
      <div className="mt-2">
        <PageHeader
          eyebrow="New engagement"
          title="Set up the deal"
          description="Thirty seconds of setup, then you'll upload the seller's documents."
        />
      </div>

      <div className="grid gap-5 md:grid-cols-5">
        <Card className="md:col-span-3">
          <form action={createEngagement} className="space-y-5">
            <div>
              <Label htmlFor="name">Engagement name</Label>
              <Input id="name" name="name" required placeholder="Project Falcon" />
              <p className="mt-1 text-xs text-muted">A code name is fine — buyers may see this.</p>
            </div>
            <div>
              <Label htmlFor="entity_name">Business legal name</Label>
              <Input id="entity_name" name="entity_name" required placeholder="Falcon Services LLC" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="period_start">Analysis period — first month</Label>
                <Input id="period_start" name="period_start" type="month" required defaultValue="2024-01" />
              </div>
              <div>
                <Label htmlFor="period_end">Last month</Label>
                <Input id="period_end" name="period_end" type="month" required defaultValue="2024-12" />
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Lenders and buyers usually want the last 2–3 full years plus the trailing twelve
              months. Start with one year — you can extend the period later.
            </p>
            <Button type="submit" size="lg" className="w-full">
              Create engagement →
            </Button>
          </form>
        </Card>

        <Card className="md:col-span-2" title="What you'll need" subtitle="Gather these from the seller — the app tells you what's missing as you go.">
          <ul className="space-y-4">
            {CHECKLIST.map(([title, body]) => (
              <li key={title} className="flex gap-2.5">
                <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-good" fill="currentColor" aria-hidden>
                  <path d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.53-8.97L7 10.56 4.47 8.03l1.06-1.06L7 8.44l3.47-3.47 1.06 1.06z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
