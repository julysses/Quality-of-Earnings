import Link from "next/link";
import { createEngagement } from "@/lib/server/actions";
import { Button, Card, Input, Label } from "@/components/ui";

export default function NewEngagement() {
  return (
    <main className="mx-auto max-w-lg p-6">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-bold">New engagement</h1>
      <Card subtitle="One engagement per deal. You'll upload documents next — bank statements, the monthly P&L, and tax returns.">
        <form action={createEngagement} className="space-y-4">
          <div>
            <Label htmlFor="name">Engagement name</Label>
            <Input id="name" name="name" required placeholder="Project Falcon" />
          </div>
          <div>
            <Label htmlFor="entity_name">Business legal name</Label>
            <Input id="entity_name" name="entity_name" required placeholder="Falcon Services LLC" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="period_start">Analysis period — first month</Label>
              <Input id="period_start" name="period_start" type="month" required defaultValue="2024-01" />
            </div>
            <div>
              <Label htmlFor="period_end">Last month</Label>
              <Input id="period_end" name="period_end" type="month" required defaultValue="2024-12" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Tip: lenders and buyers usually want the last 2–3 full years plus the trailing twelve
            months. You can start with one year and extend later.
          </p>
          <Button type="submit" className="w-full justify-center">
            Create engagement
          </Button>
        </form>
      </Card>
    </main>
  );
}
