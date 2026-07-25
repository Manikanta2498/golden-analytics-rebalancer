"use client";

import { PageHeader, PageState } from "@/components/PageState";
import { useStore } from "@/components/StoreProvider";
import { TargetEditor } from "@/components/TargetEditor";

export function TargetsPage() {
  const { applyTarget, reorderAccounts, resetToSample } = useStore();

  return (
    <PageState>
      {({ store }) => (
        <>
          <PageHeader
            title="Targets"
            description="Set the household allocation and decide which accounts should hold the cash."
          />
          <TargetEditor
            key={`${store.targetWeights
              .map((weight) => weight.weightPct)
              .join("-")}-${store.settings.driftBandPct}-${store.settings.driftBandAbs}`}
            assetClasses={store.assetClasses}
            targetWeights={store.targetWeights}
            settings={store.settings}
            accounts={store.accounts}
            onApply={applyTarget}
            onReorderAccounts={reorderAccounts}
            onReset={() => void resetToSample()}
          />
        </>
      )}
    </PageState>
  );
}
