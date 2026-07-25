"use client";

import { ClassificationsTable } from "@/components/ClassificationsTable";
import { PageHeader, PageState } from "@/components/PageState";
import { useStore } from "@/components/StoreProvider";

export function ClassificationsPage() {
  const { overrideMapping } = useStore();

  return (
    <PageState>
      {({ store }) => (
        <>
          <PageHeader
            title="Classifications"
            description="Symbols resolve through user overrides, then the seed map, then description rules, then OpenFIGI. Anything you set here always wins."
          />
          <ClassificationsTable
            mappings={store.mappings}
            assetClasses={store.assetClasses}
            positions={store.positions}
            onOverride={overrideMapping}
          />
        </>
      )}
    </PageState>
  );
}
