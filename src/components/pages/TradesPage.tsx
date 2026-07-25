"use client";

import { PageState } from "@/components/PageState";
import { TradePlanView } from "@/components/TradePlanView";

export function TradesPage() {
  return (
    <PageState>
      {({ store, plan }) => (
        <TradePlanView plan={plan} assetClasses={store.assetClasses} />
      )}
    </PageState>
  );
}
